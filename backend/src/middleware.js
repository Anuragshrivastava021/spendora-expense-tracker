import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';

export const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

export function csrfToken() {
  return randomBytes(32).toString('hex');
}

export function requireCsrf(req, res, next) {
  const cookie = req.cookies.csrf;
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return res.status(403).json({ error: 'CSRF validation failed.' });
  }
  next();
}

export function requireAuth(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  let claims;
  try {
    claims = jwt.verify(token, config.sessionSecret);
  } catch {
    res.clearCookie('session', cookieOptions());
    return res.status(401).json({ error: 'Authentication required.' });
  }
  query("SELECT id, name, email, role, email_verified, token_version FROM users WHERE id = $1 AND status = 'active' AND email_verified = TRUE", [claims.sub])
    .then((result) => {
      if (!result.rowCount || claims.ver !== result.rows[0].token_version) {
        res.clearCookie('session', cookieOptions());
        return res.status(401).json({ error: 'Authentication required.' });
      }
      req.user = result.rows[0];
      next();
    })
    .catch(next);
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.production,
    sameSite: 'lax',
    path: '/',
  };
}

export function setSessionCookie(res, token) {
  res.cookie('session', token, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function setCsrfCookie(res, token) {
  res.cookie('csrf', token, {
    ...cookieOptions(),
    httpOnly: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
