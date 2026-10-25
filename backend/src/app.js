import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import { pool, query } from './db.js';
import {
  asyncRoute, cookieOptions, csrfToken, requireAdmin, requireAuth, requireCsrf,
  setCsrfCookie, setSessionCookie,
} from './middleware.js';

export const app = express();
app.disable('x-powered-by');
if (config.production) app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    },
  },
}));
app.use(cookieParser());
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const allowedOrigin = config.frontendUrl.replace(/\/$/, '');
app.use((req, res, next) => {
  const origin = req.get('origin');
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== allowedOrigin && origin !== requestOrigin) return res.status(403).json({ error: 'Origin not allowed.' });
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use((req, res, next) => {
  if (['POST', 'PATCH', 'DELETE'].includes(req.method)) return requireCsrf(req, res, next);
  next();
});
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });
const analyticsLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false });
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(10).max(72)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes.');
const userNameSchema = z.string().trim().min(1).max(100);
const positiveAmount = z.coerce.number().finite().positive().max(9999999999);
const hashToken = (value) => createHash('sha256').update(value).digest('hex');
const parseBody = (schema, body) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join(' '));
    error.status = 400;
    throw error;
  }
  return result.data;
};
const mailer = config.smtp.host && config.smtp.user && config.smtp.password && config.smtp.from
  ? nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.password },
  })
  : null;
const sendMail = async (to, subject, text) => {
  if (!mailer) return false;
  await mailer.sendMail({ from: config.smtp.from, to, subject, text });
  return true;
};
const issueSession = (res, user) => {
  const token = jwt.sign({ sub: String(user.id), ver: user.token_version ?? 0 }, config.sessionSecret, { expiresIn: '7d' });
  setSessionCookie(res, token);
  setCsrfCookie(res, csrfToken());
};
const userView = ({ id, name, email, role, email_verified }) => ({
  id: Number(id), name, email, role, emailVerified: Boolean(email_verified),
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/auth/csrf', (req, res) => {
  const token = /^[a-f0-9]{64}$/.test(req.cookies.csrf || '') ? req.cookies.csrf : csrfToken();
  if (token !== req.cookies.csrf) setCsrfCookie(res, token);
  res.json({ csrfToken: token });
});

app.post('/api/auth/register', authLimiter, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    name: userNameSchema,
    email: emailSchema,
    password: passwordSchema,
  }).strict(), req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const created = await query(
    `INSERT INTO users (name, email, password_hash, email_verified)
     VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, email_verified, token_version`,
    [input.name, input.email, passwordHash, !mailer],
  );
  const user = created.rows[0];
  if (mailer) {
    const rawToken = randomBytes(32).toString('hex');
    await query(
      'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'24 hours\')',
      [user.id, hashToken(rawToken)],
    );
    const link = `${allowedOrigin}/verify-email?token=${rawToken}`;
    await sendMail(user.email, 'Verify your Spendora email', `Verify your email by opening this link: ${link}`);
  }
  if (!mailer) issueSession(res, user);
  res.status(201).json({
    user: userView(user),
    requiresEmailVerification: Boolean(mailer),
    message: mailer ? 'Check your email to verify your address before signing in.' : 'Account created.',
  });
}));

app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    email: emailSchema,
    password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes.'),
  }).strict(), req.body);
  const result = await query(
    'SELECT id, name, email, role, email_verified, password_hash, status, token_version FROM users WHERE email = $1',
    [input.email],
  );
  const user = result.rows[0];
  const validPassword = user && await bcrypt.compare(input.password, user.password_hash);
  if (!validPassword || user.status !== 'active' || !user.email_verified) return res.status(401).json({ error: 'Email or password is incorrect.' });
  issueSession(res, user);
  res.json({ user: userView(user) });
}));

app.post('/api/auth/logout', requireAuth, asyncRoute(async (req, res) => {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  res.clearCookie('session', cookieOptions());
  res.clearCookie('csrf', { ...cookieOptions(), httpOnly: false });
  res.json({ message: 'Signed out.' });
}));

app.post('/api/auth/verify-email', asyncRoute(async (req, res) => {
  const { token } = parseBody(z.object({ token: z.string().length(64) }).strict(), req.body);
  const verified = await query(
    `WITH valid_token AS (
       DELETE FROM email_verification_tokens WHERE token_hash = $1 AND expires_at > NOW()
       RETURNING user_id
     )
     UPDATE users SET email_verified = TRUE, updated_at = NOW()
     WHERE id = (SELECT user_id FROM valid_token) RETURNING id`,
    [hashToken(token)],
  );
  if (!verified.rowCount) return res.status(400).json({ error: 'Verification link is invalid or expired.' });
  res.json({ message: 'Email verified.' });
}));

app.post('/api/auth/resend-verification', authLimiter, asyncRoute(async (req, res) => {
  const { email } = parseBody(z.object({ email: emailSchema }).strict(), req.body);
  const user = await query('SELECT id, email, email_verified FROM users WHERE email = $1 AND status = $2', [email, 'active']);
  if (mailer && user.rowCount && !user.rows[0].email_verified) {
    const rawToken = randomBytes(32).toString('hex');
    await query('DELETE FROM email_verification_tokens WHERE user_id = $1', [user.rows[0].id]);
    await query(
      'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'24 hours\')',
      [user.rows[0].id, hashToken(rawToken)],
    );
    await sendMail(email, 'Verify your Spendora email', `Verify your email by opening this link: ${allowedOrigin}/verify-email?token=${rawToken}`);
  }
  res.json({ message: 'If the account needs verification, a new email will be sent.' });
}));

app.post('/api/auth/forgot-password', authLimiter, asyncRoute(async (req, res) => {
  const { email } = parseBody(z.object({ email: emailSchema }).strict(), req.body);
  const result = await query("SELECT id, email FROM users WHERE email = $1 AND status = 'active'", [email]);
  if (result.rowCount && mailer) {
    const rawToken = randomBytes(32).toString('hex');
    await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [result.rows[0].id]);
    await query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')',
      [result.rows[0].id, hashToken(rawToken)],
    );
    const link = `${allowedOrigin}/reset-password?token=${rawToken}`;
    await sendMail(email, 'Reset your Spendora password', `Reset your password by opening this link: ${link}`);
  }
  res.json({ message: 'If the account exists and email delivery is configured, a reset link will be sent.' });
}));

app.post('/api/auth/reset-password', authLimiter, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({ token: z.string().length(64), password: passwordSchema }).strict(), req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'DELETE FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > NOW() RETURNING user_id',
      [hashToken(input.token)],
    );
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Reset link is invalid or expired.' });
    }
    await client.query('UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = NOW() WHERE id = $2', [passwordHash, found.rows[0].user_id]);
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [found.rows[0].user_id]);
    await client.query('COMMIT');
    res.json({ message: 'Password updated. You can now sign in.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: userView(req.user) }));

app.get('/api/profile', requireAuth, (req, res) => res.json({ user: userView(req.user) }));
app.patch('/api/profile', requireAuth, asyncRoute(async (req, res) => {
  const { name } = parseBody(z.object({ name: userNameSchema }).strict(), req.body);
  const result = await query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role, email_verified', [name, req.user.id]);
  res.json({ user: userView(result.rows[0]) });
}));
app.patch('/api/profile/password', requireAuth, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    currentPassword: z.string().min(1).max(72),
    newPassword: passwordSchema,
  }).strict(), req.body);
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!await bcrypt.compare(input.currentPassword, result.rows[0].password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const updated = await query(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = NOW()
     WHERE id = $2 RETURNING id, token_version`,
    [passwordHash, req.user.id],
  );
  issueSession(res, updated.rows[0]);
  res.json({ message: 'Password updated.' });
}));

app.get('/api/content', asyncRoute(async (_req, res) => {
  const result = await query(
    'SELECT id, slug, title, body, content_type, updated_at FROM content WHERE published = TRUE ORDER BY content_type, updated_at DESC',
  );
  res.json({ content: result.rows });
}));
app.get('/api/content/:slug', asyncRoute(async (req, res) => {
  const result = await query(
    'SELECT id, slug, title, body, content_type, updated_at FROM content WHERE slug = $1 AND published = TRUE',
    [req.params.slug],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Content not found.' });
  res.json({ content: result.rows[0] });
}));
app.post('/api/contact', contactLimiter, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    name: userNameSchema,
    email: emailSchema,
    message: z.string().trim().min(10).max(3000),
  }).strict(), req.body);
  await query('INSERT INTO contact_submissions (name, email, message) VALUES ($1, $2, $3)', [input.name, input.email, input.message]);
  res.status(201).json({ message: 'Thanks for reaching out. We will be in touch soon.' });
}));
app.post('/api/analytics/track', analyticsLimiter, asyncRoute(async (req, res) => {
  const { path } = parseBody(z.object({ path: z.string().max(221).regex(/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/) }).strict(), req.body);
  await query('INSERT INTO page_views (path) VALUES ($1)', [path]);
  res.status(202).json({ recorded: true });
}));

app.get('/api/finance/summary', requireAuth, asyncRoute(async (req, res) => {
  const [totals, categories, recent, budgets, goals] = await Promise.all([
    query(
      `SELECT
        COALESCE(SUM(amount) FILTER (WHERE kind = 'income' AND date_trunc('month', occurred_on) = date_trunc('month', CURRENT_DATE)), 0) AS income,
        COALESCE(SUM(amount) FILTER (WHERE kind = 'expense' AND date_trunc('month', occurred_on) = date_trunc('month', CURRENT_DATE)), 0) AS expenses,
        (SELECT COALESCE(SUM(opening_balance), 0) FROM accounts WHERE user_id = $1)
          + COALESCE(SUM(amount) FILTER (WHERE kind = 'income'), 0)
          - COALESCE(SUM(amount) FILTER (WHERE kind = 'expense'), 0) AS balance
       FROM transactions WHERE user_id = $1`,
      [req.user.id],
    ),
    query(
      `SELECT category, SUM(amount) AS amount FROM transactions
       WHERE user_id = $1 AND kind = 'expense' AND date_trunc('month', occurred_on) = date_trunc('month', CURRENT_DATE)
       GROUP BY category ORDER BY SUM(amount) DESC LIMIT 6`,
      [req.user.id],
    ),
    query(
      `SELECT id, kind, amount, category, description, occurred_on FROM transactions
       WHERE user_id = $1 ORDER BY occurred_on DESC, id DESC LIMIT 8`,
      [req.user.id],
    ),
    query(
      `SELECT b.id, b.category, b.amount, b.month, COALESCE(SUM(t.amount), 0) AS spent
       FROM budgets b LEFT JOIN transactions t ON t.user_id = b.user_id AND t.category = b.category
         AND t.kind = 'expense' AND date_trunc('month', t.occurred_on) = date_trunc('month', b.month)
       WHERE b.user_id = $1 AND date_trunc('month', b.month) = date_trunc('month', CURRENT_DATE)
       GROUP BY b.id ORDER BY b.category`,
      [req.user.id],
    ),
    query('SELECT id, name, target_amount, saved_amount, target_date FROM savings_goals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5', [req.user.id]),
  ]);
  res.json({ totals: totals.rows[0], categories: categories.rows, recent: recent.rows, budgets: budgets.rows, goals: goals.rows });
}));

app.get('/api/finance/transactions', requireAuth, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT id, kind, amount, category, description, occurred_on FROM transactions
     WHERE user_id = $1 ORDER BY occurred_on DESC, id DESC LIMIT 100`,
    [req.user.id],
  );
  res.json({ transactions: result.rows });
}));
app.get('/api/finance/accounts', requireAuth, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT a.id, a.name, a.account_type, a.opening_balance,
       a.opening_balance + COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount ELSE -t.amount END), 0) AS balance
     FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = a.user_id
     WHERE a.user_id = $1 GROUP BY a.id ORDER BY a.created_at`,
    [req.user.id],
  );
  res.json({ accounts: result.rows });
}));
app.post('/api/finance/accounts', requireAuth, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    name: z.string().trim().min(1).max(80),
    accountType: z.enum(['cash', 'bank', 'credit', 'wallet']).default('cash'),
    openingBalance: z.coerce.number().finite().min(-9999999999).max(9999999999).default(0),
  }).strict(), req.body);
  const result = await query(
    'INSERT INTO accounts (user_id, name, account_type, opening_balance) VALUES ($1, $2, $3, $4) RETURNING id, name, account_type, opening_balance',
    [req.user.id, input.name, input.accountType, input.openingBalance],
  );
  res.status(201).json({ account: result.rows[0] });
}));
app.post('/api/finance/transactions', requireAuth, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    kind: z.enum(['income', 'expense']),
    amount: positiveAmount,
    category: z.string().trim().min(1).max(60),
    description: z.string().trim().max(240).default(''),
    occurredOn: z.string().date().optional(),
    accountId: z.coerce.number().int().positive().nullable().optional(),
  }).strict(), req.body);
  const result = await query(
    `INSERT INTO transactions (user_id, account_id, kind, amount, category, description, occurred_on)
     SELECT $1, a.id, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE)
     FROM (SELECT 1) seed LEFT JOIN accounts a ON a.id = $7 AND a.user_id = $1
     WHERE $7::bigint IS NULL OR a.id IS NOT NULL
     RETURNING id, kind, amount, category, description, occurred_on`,
    [req.user.id, input.kind, input.amount, input.category, input.description, input.occurredOn || null, input.accountId || null],
  );
  if (!result.rowCount) return res.status(400).json({ error: 'Account not found.' });
  res.status(201).json({ transaction: result.rows[0] });
}));
app.delete('/api/finance/transactions/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid transaction ID.' });
  const result = await query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [id.data, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Transaction not found.' });
  res.sendStatus(204);
}));

app.get('/api/finance/budgets', requireAuth, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT b.id, b.category, b.amount, b.month, COALESCE(SUM(t.amount), 0) AS spent
     FROM budgets b LEFT JOIN transactions t ON t.user_id = b.user_id AND t.category = b.category
       AND t.kind = 'expense' AND date_trunc('month', t.occurred_on) = date_trunc('month', b.month)
     WHERE b.user_id = $1 GROUP BY b.id ORDER BY b.month DESC, b.category`,
    [req.user.id],
  );
  res.json({ budgets: result.rows });
}));
app.post('/api/finance/budgets', requireAuth, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    category: z.string().trim().min(1).max(60),
    amount: positiveAmount,
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }).strict(), req.body);
  const month = `${input.month || new Date().toISOString().slice(0, 7)}-01`;
  const result = await query(
    `INSERT INTO budgets (user_id, category, amount, month) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, category, month) DO UPDATE SET amount = EXCLUDED.amount
     RETURNING id, category, amount, month`,
    [req.user.id, input.category, input.amount, month],
  );
  res.status(201).json({ budget: result.rows[0] });
}));

app.get('/api/finance/goals', requireAuth, asyncRoute(async (req, res) => {
  const result = await query('SELECT id, name, target_amount, saved_amount, target_date FROM savings_goals WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ goals: result.rows });
}));
app.post('/api/finance/goals', requireAuth, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    name: userNameSchema,
    targetAmount: positiveAmount,
    savedAmount: z.coerce.number().finite().nonnegative().max(9999999999).default(0),
    targetDate: z.string().date().optional(),
  }).strict(), req.body);
  const result = await query(
    `INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, target_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, name, target_amount, saved_amount, target_date`,
    [req.user.id, input.name, input.targetAmount, input.savedAmount, input.targetDate || null],
  );
  res.status(201).json({ goal: result.rows[0] });
}));
app.patch('/api/finance/goals/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const input = parseBody(z.object({
    savedAmount: z.coerce.number().finite().nonnegative().max(9999999999),
  }).strict(), req.body);
  if (!id.success) return res.status(400).json({ error: 'Invalid goal ID.' });
  const result = await query(
    'UPDATE savings_goals SET saved_amount = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name, target_amount, saved_amount, target_date',
    [input.savedAmount, id.data, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Savings goal not found.' });
  res.json({ goal: result.rows[0] });
}));

app.get('/api/finance/bills', requireAuth, asyncRoute(async (req, res) => {
  const result = await query(
    'SELECT id, name, amount, category, frequency, next_due_on, active FROM recurring_bills WHERE user_id = $1 ORDER BY active DESC, next_due_on',
    [req.user.id],
  );
  res.json({ bills: result.rows });
}));
app.post('/api/finance/bills', requireAuth, asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    name: z.string().trim().min(1).max(100),
    amount: positiveAmount,
    category: z.string().trim().min(1).max(60),
    frequency: z.enum(['weekly', 'monthly', 'yearly']),
    nextDueOn: z.string().date(),
  }).strict(), req.body);
  const result = await query(
    `INSERT INTO recurring_bills (user_id, name, amount, category, frequency, next_due_on)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, amount, category, frequency, next_due_on, active`,
    [req.user.id, input.name, input.amount, input.category, input.frequency, input.nextDueOn],
  );
  res.status(201).json({ bill: result.rows[0] });
}));
app.patch('/api/finance/bills/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const { active } = parseBody(z.object({ active: z.boolean() }).strict(), req.body);
  if (!id.success) return res.status(400).json({ error: 'Invalid bill ID.' });
  const result = await query(
    'UPDATE recurring_bills SET active = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name, amount, category, frequency, next_due_on, active',
    [active, id.data, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Recurring bill not found.' });
  res.json({ bill: result.rows[0] });
}));
app.delete('/api/finance/bills/:id', requireAuth, asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid bill ID.' });
  const result = await query('DELETE FROM recurring_bills WHERE id = $1 AND user_id = $2', [id.data, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Recurring bill not found.' });
  res.sendStatus(204);
}));

app.get('/api/finance/groups', requireAuth, asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT g.id, g.name, g.created_at, gm.member_role,
       COUNT(all_members.user_id) AS member_count
     FROM shared_group_members gm
     JOIN shared_groups g ON g.id = gm.group_id
     JOIN shared_group_members all_members ON all_members.group_id = g.id
     WHERE gm.user_id = $1 GROUP BY g.id, gm.member_role ORDER BY g.created_at DESC`,
    [req.user.id],
  );
  res.json({ groups: result.rows });
}));
app.post('/api/finance/groups', requireAuth, asyncRoute(async (req, res) => {
  const { name } = parseBody(z.object({ name: z.string().trim().min(1).max(100) }).strict(), req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query(
      'INSERT INTO shared_groups (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at',
      [name, req.user.id],
    );
    await client.query(
      "INSERT INTO shared_group_members (group_id, user_id, member_role) VALUES ($1, $2, 'owner')",
      [group.rows[0].id, req.user.id],
    );
    await client.query('COMMIT');
    res.status(201).json({ group: { ...group.rows[0], member_role: 'owner', member_count: 1 } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));
app.get('/api/finance/groups/:id/members', requireAuth, asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid group ID.' });
  const access = await query('SELECT 1 FROM shared_group_members WHERE group_id = $1 AND user_id = $2', [id.data, req.user.id]);
  if (!access.rowCount) return res.status(404).json({ error: 'Group not found.' });
  const result = await query(
    `SELECT u.id, u.name, u.email, gm.member_role, gm.joined_at
     FROM shared_group_members gm JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 ORDER BY gm.joined_at`,
    [id.data],
  );
  res.json({ members: result.rows });
}));
app.post('/api/finance/groups/:id/members', requireAuth, asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const { email } = parseBody(z.object({ email: emailSchema }).strict(), req.body);
  if (!id.success) return res.status(400).json({ error: 'Invalid group ID.' });
  const access = await query('SELECT 1 FROM shared_group_members WHERE group_id = $1 AND user_id = $2', [id.data, req.user.id]);
  if (!access.rowCount) return res.status(404).json({ error: 'Group not found.' });
  const invitee = await query("SELECT id, name, email FROM users WHERE email = $1 AND status = 'active'", [email]);
  if (!invitee.rowCount) return res.status(404).json({ error: 'Active account not found for that email.' });
  const added = await query(
    `INSERT INTO shared_group_members (group_id, user_id) VALUES ($1, $2)
     ON CONFLICT (group_id, user_id) DO NOTHING
     RETURNING group_id`,
    [id.data, invitee.rows[0].id],
  );
  if (!added.rowCount) return res.status(409).json({ error: 'That person is already in this group.' });
  res.status(201).json({ member: invitee.rows[0] });
}));
app.get('/api/finance/groups/:id/expenses', requireAuth, asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid group ID.' });
  const access = await query('SELECT 1 FROM shared_group_members WHERE group_id = $1 AND user_id = $2', [id.data, req.user.id]);
  if (!access.rowCount) return res.status(404).json({ error: 'Group not found.' });
  const result = await query(
    `SELECT e.id, e.description, e.amount, e.category, e.occurred_on, e.created_at,
       payer.name AS paid_by,
       COALESCE(JSON_AGG(JSON_BUILD_OBJECT(
         'userId', split_user.id, 'name', split_user.name, 'amount', s.amount, 'settledAt', s.settled_at
       ) ORDER BY split_user.name) FILTER (WHERE s.user_id IS NOT NULL), '[]') AS splits
     FROM shared_expenses e
     JOIN shared_group_members access ON access.group_id = e.group_id AND access.user_id = $2
     JOIN users payer ON payer.id = e.paid_by_user_id
     LEFT JOIN shared_expense_splits s ON s.expense_id = e.id
     LEFT JOIN users split_user ON split_user.id = s.user_id
     WHERE e.group_id = $1
     GROUP BY e.id, payer.name ORDER BY e.occurred_on DESC, e.id DESC`,
    [id.data, req.user.id],
  );
  res.json({ expenses: result.rows });
}));
app.post('/api/finance/groups/:id/expenses', requireAuth, asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const input = parseBody(z.object({
    description: z.string().trim().min(1).max(240),
    amount: positiveAmount,
    category: z.string().trim().min(1).max(60),
    occurredOn: z.string().date().optional(),
    splits: z.array(z.object({
      userId: z.coerce.number().int().positive(),
      amount: positiveAmount,
    }).strict()).min(1).max(50),
  }).strict(), req.body);
  if (!id.success) return res.status(400).json({ error: 'Invalid group ID.' });
  const totalCents = Math.round(input.amount * 100);
  const splitCents = input.splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0);
  const memberIds = input.splits.map((split) => split.userId);
  if (splitCents !== totalCents || new Set(memberIds).size !== memberIds.length) {
    return res.status(400).json({ error: 'Each group member must have one split and the splits must add up to the total.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const members = await client.query(
      'SELECT user_id FROM shared_group_members WHERE group_id = $1 AND user_id = ANY($2::bigint[])',
      [id.data, [req.user.id, ...memberIds]],
    );
    const memberSet = new Set(members.rows.map((row) => Number(row.user_id)));
    if (!memberSet.has(Number(req.user.id)) || memberIds.some((memberId) => !memberSet.has(memberId))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Group or one of its members was not found.' });
    }
    const expense = await client.query(
      `INSERT INTO shared_expenses (group_id, paid_by_user_id, description, amount, category, occurred_on)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE)) RETURNING id`,
      [id.data, req.user.id, input.description, input.amount, input.category, input.occurredOn || null],
    );
    for (const split of input.splits) {
      await client.query(
        'INSERT INTO shared_expense_splits (expense_id, user_id, amount) VALUES ($1, $2, $3)',
        [expense.rows[0].id, split.userId, split.amount],
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ expenseId: Number(expense.rows[0].id) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));
app.patch('/api/finance/groups/:groupId/expenses/:expenseId/settlement', requireAuth, asyncRoute(async (req, res) => {
  const groupId = z.coerce.number().int().positive().safeParse(req.params.groupId);
  const expenseId = z.coerce.number().int().positive().safeParse(req.params.expenseId);
  const { settled } = parseBody(z.object({ settled: z.boolean() }).strict(), req.body);
  if (!groupId.success || !expenseId.success) return res.status(400).json({ error: 'Invalid group or expense ID.' });
  const result = await query(
    `UPDATE shared_expense_splits s SET settled_at = CASE WHEN $1 THEN NOW() ELSE NULL END
     FROM shared_expenses e
     WHERE s.expense_id = e.id AND e.group_id = $2 AND s.expense_id = $3 AND s.user_id = $4
     RETURNING s.expense_id, s.user_id, s.amount, s.settled_at`,
    [settled, groupId.data, expenseId.data, req.user.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Your split was not found.' });
  res.json({ split: result.rows[0] });
}));

app.use('/api/admin', requireAuth, requireAdmin);
app.get('/api/admin/analytics', asyncRoute(async (_req, res) => {
  const [counts, trends, pages, activity] = await Promise.all([
    query(
      `SELECT (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days') AS new_users,
       (SELECT COUNT(*) FROM content WHERE published = TRUE) AS published_content,
       (SELECT COUNT(*) FROM page_views) AS page_views`,
    ),
    query(
      `SELECT DATE(viewed_at) AS day, COUNT(*) AS views FROM page_views
       WHERE viewed_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(viewed_at) ORDER BY day`,
    ),
    query(
      `SELECT path, COUNT(*) AS views FROM page_views GROUP BY path ORDER BY COUNT(*) DESC LIMIT 8`,
    ),
    query(
      `SELECT id, actor_id, action, target_type, target_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10`,
    ),
  ]);
  res.json({ counts: counts.rows[0], viewsOverTime: trends.rows, popularPages: pages.rows, recentActivity: activity.rows });
}));
app.get('/api/admin/users', asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    search: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }), req.query);
  const search = input.search ? `%${input.search.replace(/[\\%_]/g, '\\$&')}%` : null;
  const result = await query(
    `SELECT id, name, email, role, status, created_at FROM users
     WHERE ($1::text IS NULL OR name ILIKE $1 OR email ILIKE $1)
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [search, input.limit, (input.page - 1) * input.limit],
  );
  const count = await query('SELECT COUNT(*) AS total FROM users WHERE ($1::text IS NULL OR name ILIKE $1 OR email ILIKE $1)', [search]);
  res.json({ users: result.rows, page: input.page, total: Number(count.rows[0].total), limit: input.limit });
}));
app.patch('/api/admin/users/:id/role', asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const { role } = parseBody(z.object({ role: z.enum(['user', 'admin']) }).strict(), req.body);
  if (!id.success) return res.status(400).json({ error: 'Invalid user ID.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const target = await client.query('SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE', [id.data]);
    if (!target.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }
    if (target.rows[0].role === 'admin' && target.rows[0].status === 'active' && role !== 'admin') {
      const admins = await client.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active' FOR UPDATE");
      if (admins.rowCount <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You cannot remove the last administrator role.' });
      }
    }
    const updated = await client.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role, status', [role, id.data]);
    await client.query(
      'INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'user.role.updated', 'user', String(id.data)],
    );
    await client.query('COMMIT');
    res.json({ user: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));
app.get('/api/admin/content', asyncRoute(async (_req, res) => {
  const result = await query(
    'SELECT id, slug, title, body, content_type, published, created_at, updated_at FROM content ORDER BY updated_at DESC',
  );
  res.json({ content: result.rows });
}));
app.post('/api/admin/content', asyncRoute(async (req, res) => {
  const input = parseBody(z.object({
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
    title: z.string().trim().min(1).max(180),
    body: z.string().trim().min(1).max(20000),
    contentType: z.enum(['page', 'service', 'update']).default('page'),
    published: z.boolean().default(false),
  }).strict(), req.body);
  const result = await query(
    `INSERT INTO content (slug, title, body, content_type, published, author_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, slug, title, body, content_type, published`,
    [input.slug, input.title, input.body, input.contentType, input.published, req.user.id],
  );
  await query('INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)', [req.user.id, 'content.created', 'content', String(result.rows[0].id)]);
  res.status(201).json({ content: result.rows[0] });
}));
app.patch('/api/admin/content/:id', asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const input = parseBody(z.object({
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
    title: z.string().trim().min(1).max(180),
    body: z.string().trim().min(1).max(20000),
    contentType: z.enum(['page', 'service', 'update']),
    published: z.boolean(),
  }).strict(), req.body);
  if (!id.success) return res.status(400).json({ error: 'Invalid content ID.' });
  const result = await query(
    `UPDATE content SET slug = $1, title = $2, body = $3, content_type = $4, published = $5, updated_at = NOW()
     WHERE id = $6 RETURNING id, slug, title, body, content_type, published`,
    [input.slug, input.title, input.body, input.contentType, input.published, id.data],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Content not found.' });
  await query('INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)', [req.user.id, 'content.updated', 'content', String(id.data)]);
  res.json({ content: result.rows[0] });
}));
app.delete('/api/admin/content/:id', asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid content ID.' });
  const result = await query('DELETE FROM content WHERE id = $1', [id.data]);
  if (!result.rowCount) return res.status(404).json({ error: 'Content not found.' });
  await query('INSERT INTO audit_logs (actor_id, action, target_type, target_id) VALUES ($1, $2, $3, $4)', [req.user.id, 'content.deleted', 'content', String(id.data)]);
  res.sendStatus(204);
}));
app.get('/api/admin/contacts', asyncRoute(async (_req, res) => {
  const result = await query('SELECT id, name, email, message, created_at FROM contact_submissions ORDER BY created_at DESC LIMIT 100');
  res.json({ submissions: result.rows });
}));

if (config.production) {
  const frontendDist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    res.sendFile(resolve(frontendDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((error, _req, res, _next) => {
  if (error.code === '23505') return res.status(409).json({ error: 'A record with those details already exists.' });
  if (error.code === '23503') return res.status(400).json({ error: 'The requested record is not valid.' });
  if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
  console.error('Request failed:', error.message);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});
