CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  body TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'page' CHECK (content_type IN ('page', 'service', 'update')),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  author_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  account_type TEXT NOT NULL DEFAULT 'cash' CHECK (account_type IN ('cash', 'bank', 'credit', 'wallet')),
  opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 60),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 240),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 60),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  month DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, category, month)
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  saved_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (saved_amount >= 0),
  target_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_bills (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 60),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  next_due_on DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_groups (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_group_members (
  group_id BIGINT NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS shared_expenses (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES shared_groups(id) ON DELETE CASCADE,
  paid_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 240),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 60),
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_expense_splits (
  expense_id BIGINT NOT NULL REFERENCES shared_expenses(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  settled_at TIMESTAMPTZ,
  PRIMARY KEY (expense_id, user_id)
);

CREATE TABLE IF NOT EXISTS page_views (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL CHECK (char_length(path) <= 240),
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions(user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS budgets_user_month_idx ON budgets(user_id, month);
CREATE INDEX IF NOT EXISTS page_views_date_idx ON page_views(viewed_at DESC);
CREATE INDEX IF NOT EXISTS page_views_path_idx ON page_views(path);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS content_published_idx ON content(published, updated_at DESC);
CREATE INDEX IF NOT EXISTS recurring_bills_due_idx ON recurring_bills(user_id, next_due_on) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS shared_group_members_user_idx ON shared_group_members(user_id, group_id);
CREATE INDEX IF NOT EXISTS shared_expenses_group_idx ON shared_expenses(group_id, occurred_on DESC);

INSERT INTO content (slug, title, body, content_type, published) VALUES
  ('home-hero', 'Make room for your next big thing.', 'A softer, smarter way to understand your spending, stay on top of your goals, and feel good about your money.', 'page', TRUE),
  ('about-us', 'Money clarity, without the pressure.', 'Spendora makes everyday money management feel less like homework. We bring your spending, budgets, and goals into one calm place, so you can make confident choices at your own pace.', 'page', TRUE),
  ('spending-insights', 'Spending insights', 'See your money patterns at a glance. Thoughtful category breakdowns help you notice trends before they become surprises.', 'service', TRUE),
  ('flexible-budgets', 'Flexible budgets', 'Set a monthly limit that works for you, keep an eye on progress, and adjust whenever life changes.', 'service', TRUE),
  ('goals-that-grow', 'Goals that grow with you', 'Turn a big plan into small, satisfying milestones with a savings goal tracker that keeps progress visible.', 'service', TRUE),
  ('a-fresh-start', 'A fresh start for your finances', 'Meet Spendora: a clearer, calmer way to make your money work for what matters to you.', 'update', TRUE)
ON CONFLICT (slug) DO NOTHING;
