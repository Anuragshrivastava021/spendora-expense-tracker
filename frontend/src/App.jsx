import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp,
  CreditCard, Download, FileText, Goal, LayoutDashboard, LifeBuoy, LogOut,
  Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, TrendingUp, Wallet,
  X, Landmark, Coffee, CarFront, ShoppingBag, House, HeartPulse, CircleDollarSign,
  Users, CalendarDays, Pause, Play, UserPlus,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';

const API = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');
const palette = ['#8057ec', '#20b486', '#ff9b53', '#4b92ed', '#e76485', '#a7a1b2'];
const categories = ['Food & dining', 'Transport', 'Shopping', 'Housing', 'Health', 'Entertainment', 'Other'];
const iconByCategory = {
  'Food & dining': Coffee, Transport: CarFront, Shopping: ShoppingBag,
  Housing: House, Health: HeartPulse, Other: CircleDollarSign,
};
const currency = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number(value || 0));

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
  if (options.method && options.method !== 'GET') {
    const csrf = await fetch(`${API}/auth/csrf`, { credentials: 'include' });
    if (!csrf.ok) throw new Error('Could not start a secure request. Please refresh and try again.');
    const { csrfToken } = await csrf.json();
    headers['X-CSRF-Token'] = csrfToken;
  }
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

function Brand({ onClick }) {
  return <button className="brand" onClick={onClick} aria-label="Spendora home">
    <span className="brand-mark"><Wallet size={18} strokeWidth={2.5} /></span>
    <span className="brand-name">Spendora</span>
  </button>;
}

function Notice({ notice, dismiss }) {
  if (!notice) return null;
  return <div className={`notice ${notice.kind}`} role="status">
    {notice.kind === 'success' ? <Check size={17} /> : <CircleHelp size={17} />}
    <span>{notice.text}</span>
    <button onClick={dismiss} aria-label="Dismiss message"><X size={16} /></button>
  </div>;
}

function AuthScreen({ onAuthenticated, setNotice }) {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [resetToken, setResetToken] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const verificationHandled = useRef(false);
  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('token') && window.location.pathname === '/reset-password') {
      setResetToken(params.get('token'));
      setMode('reset');
      window.history.replaceState({}, '', '/reset-password');
    } else if (params.get('token') && window.location.pathname === '/verify-email' && !verificationHandled.current) {
      verificationHandled.current = true;
      const token = params.get('token');
      window.history.replaceState({}, '', '/verify-email');
      api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
        .then(({ message }) => setNotice({ kind: 'success', text: message }))
        .catch((error) => setNotice({ kind: 'error', text: error.message }));
    }
  }, [setNotice]);

  const submit = async (event) => {
    event.preventDefault();
    if (mode === 'register') setVerificationEmail(form.email);
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const { message } = await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: form.email }) });
        setNotice({ kind: 'success', text: message });
        setMode('login');
        return;
      }
      if (mode === 'reset') {
        const { message } = await api('/auth/reset-password', {
          method: 'POST', body: JSON.stringify({ token: resetToken, password: form.password }),
        });
        setNotice({ kind: 'success', text: message });
        setMode('login');
        window.history.replaceState({}, '', '/');
        return;
      }
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const payload = mode === 'register'
        ? { name: form.name, email: form.email, password: form.password }
        : { email: form.email, password: form.password };
      const { user, message, requiresEmailVerification } = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      if (!requiresEmailVerification) onAuthenticated(user);
      if (message) setNotice({ kind: 'success', text: message });
      if (requiresEmailVerification) {
        setMode('login');
        setVerificationEmail(form.email);
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };
  const resendVerification = async () => {
    setBusy(true);
    try {
      const { message } = await api('/auth/resend-verification', {
        method: 'POST', body: JSON.stringify({ email: verificationEmail }),
      });
      setNotice({ kind: 'success', text: message });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };
  const titles = {
    login: ['Welcome back', 'Sign in to pick up where you left off.'],
    register: ['Your money, in focus', 'Create your free account and start fresh.'],
    forgot: ['Forgot your password?', 'We’ll send a reset link if an account matches.'],
    reset: ['Choose a new password', 'Make it at least 10 characters long.'],
  };

  return <main className="auth-page">
    <div className="auth-aside">
      <Brand onClick={() => { window.location.href = '/'; }} />
      <div className="auth-art">
        <div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" />
        <div className="art-card">
          <span className="art-eyebrow">YOUR MONEY, IN FOCUS</span>
          <div className="art-number art-message">A clearer view</div>
          <div className="art-chart"><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="art-foot"><span>Made for your everyday</span><span><Check size={13} /> Yours to shape</span></div>
        </div>
        <div className="art-float"><span className="float-icon"><TrendingUp size={16} /></span><span><b>One step at a time</b><small>Build your money routine</small></span><Check size={17} /></div>
      </div>
      <div className="auth-aside-copy"><h2>Small steps.<br />Big peace of mind.</h2><p>Make space for the things that matter most.</p></div>
      <div className="auth-aside-bottom"><span>© 2026 Spendora</span><span>Made for your next chapter</span></div>
    </div>
    <section className="auth-form-wrap">
      <div className="auth-form">
        <div className="mobile-brand"><Brand onClick={() => { window.location.href = '/'; }} /></div>
        <div className="auth-heading"><span className="eyebrow">YOUR FINANCIAL HOME</span><h1>{titles[mode][0]}</h1><p>{titles[mode][1]}</p></div>
        <form onSubmit={submit} className="stack-form">
          {mode === 'register' && <label>Full name<input autoComplete="name" value={form.name} onChange={update('name')} required maxLength={100} placeholder="Jordan Lee" /></label>}
          {mode !== 'reset' && <label>Email address<input type="email" autoComplete="email" value={form.email} onChange={update('email')} required placeholder="you@example.com" /></label>}
          {['login', 'register', 'reset'].includes(mode) && <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={update('password')} required minLength={mode === 'login' ? 1 : 10} maxLength={72} placeholder={mode === 'login' ? 'Your password' : 'At least 10 characters'} /></label>}
          {mode === 'login' && <button className="text-button forgot-link" type="button" onClick={() => setMode('forgot')}>Forgot password?</button>}
          <Button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Update password'} <ArrowRight size={17} /></Button>
        </form>
        {verificationEmail && <div className="verify-callout"><span>Waiting on an email verification?</span><button type="button" onClick={resendVerification} disabled={busy}>{busy ? 'Sending…' : 'Resend verification email'}</button></div>}
        <div className="auth-switch">
          {mode === 'login' ? <>New to Spendora? <button onClick={() => setMode('register')}>Create an account</button></>
            : mode === 'register' ? <>Already have an account? <button onClick={() => setMode('login')}>Sign in</button></>
              : <button onClick={() => setMode('login')}>Back to sign in</button>}
        </div>
        <p className="auth-terms">By continuing, you agree to our <a href="#terms">Terms of service</a> and <a href="#privacy">Privacy policy</a>.</p>
      </div>
    </section>
  </main>;
}

function PublicHome({ onSignIn, setNotice }) {
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const trackedPath = useRef(null);
  useEffect(() => {
    api('/content').then(({ content: records }) => setContent(records)).catch((error) => setNotice({ kind: 'error', text: error.message })).finally(() => setLoading(false));
    const trackPageView = () => {
      const section = window.location.hash.slice(1);
      const path = ['services', 'about', 'updates', 'contact'].includes(section) ? `/${section}` : '/';
      if (trackedPath.current === path) return;
      trackedPath.current = path;
      api('/analytics/track', { method: 'POST', body: JSON.stringify({ path }) })
        .catch((error) => setNotice({ kind: 'error', text: error.message }));
    };
    trackPageView();
    window.addEventListener('hashchange', trackPageView);
    return () => window.removeEventListener('hashchange', trackPageView);
  }, [setNotice]);
  const hero = content.find((item) => item.slug === 'home-hero');
  const about = content.find((item) => item.slug === 'about-us');
  const services = content.filter((item) => item.content_type === 'service');
  const updates = content.filter((item) => item.content_type === 'update');
  const sendContact = async (event) => {
    event.preventDefault();
    setSending(true);
    try {
      const { message } = await api('/contact', { method: 'POST', body: JSON.stringify(contact) });
      setNotice({ kind: 'success', text: message });
      setContact({ name: '', email: '', message: '' });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setSending(false);
    }
  };
  return <div className="public-page">
    <header className="public-header">
      <div className="public-nav container"><Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <nav aria-label="Main navigation"><a href="#services">What you get</a><a href="#about">Our story</a><a href="#updates">Updates</a><a href="#contact">Contact</a></nav>
        <Button variant="outline" onClick={onSignIn}>Sign in <ArrowRight size={16} /></Button>
      </div>
    </header>
    <main>
      <section className="hero-section">
        <div className="hero-deco hero-deco-a" /><div className="hero-deco hero-deco-b" />
        <div className="hero-grid container">
          <div className="hero-copy"><span className="eyebrow"><Sparkles size={14} /> A LITTLE MORE CLARITY</span>
            <h1>{loading ? 'Your money, in a more mindful place.' : hero?.title || 'Your money, in a more mindful place.'}</h1>
            <p>{hero?.body || 'A thoughtful way to understand your spending, stay on top of your goals, and feel good about your money.'}</p>
            <div className="hero-actions"><Button onClick={onSignIn}>Start your free account <ArrowRight size={17} /></Button><a className="hero-secondary" href="#services">Explore Spendora <span>↓</span></a></div>
            <div className="hero-proof"><div className="avatar-stack"><i>J</i><i>M</i><i>A</i><i>+</i></div><span><b>A calmer money routine</b><small>Made for real life, every day.</small></span></div>
          </div>
          <div className="hero-visual" aria-label="Illustration of a monthly spending summary">
            <div className="hero-sparkle sparkle-one">✳</div><div className="hero-sparkle sparkle-two">✦</div>
            <div className="hero-dashboard">
              <div className="mini-top">              <div><span className="mini-label">YOUR MONEY, AT A GLANCE</span><b>A clearer view</b></div><span className="mini-avatar">S</span></div>
              <div className="mini-chart-label"><span>Spending overview</span><span className="mini-period">This month⌄</span></div>
              <div className="mini-bars">{[35, 58, 44, 76, 52, 91, 62, 73, 48, 82, 64, 94].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
              <div className="mini-legend"><span><i /> Income</span><span><i /> Spending</span></div>
              <div className="mini-goal"><span className="goal-icon"><Goal size={18} /></span><span><b>Something you’re saving for</b><small>Your goals, your timeline</small></span><strong>✦</strong></div>
            </div>
            <div className="hero-floating"><span><Check size={14} /></span><div><b>Your money, together</b><small>A little clarity every day</small></div></div>
          </div>
        </div>
        <div className="hero-bottom container"><span>YOUR EVERYDAY MONEY, ALL TOGETHER</span><div><span><Wallet size={16} /> Track spending</span><span><TrendingUp size={16} /> Find your flow</span><span><Goal size={16} /> Reach your goals</span></div></div>
      </section>
      <section className="service-section section-pad" id="services">
        <div className="container"><div className="section-heading"><span className="eyebrow">A BETTER WAY TO KEEP UP</span><h2>A little clarity goes<br />a long way.</h2><p>Everything you need to feel more in control, without the spreadsheets.</p></div>
          {loading ? <div className="empty-state">Loading services…</div> : services.length ? <div className="service-grid">
            {services.map((item, index) => {
              const Icon = [TrendingUp, Wallet, Goal][index % 3];
              return <article className="service-card" key={item.id}><span className={`service-icon service-icon-${index % 3}`}><Icon size={21} /></span><h3>{item.title}</h3><p>{item.body}</p><a href="#contact">Learn more <ArrowRight size={15} /></a></article>;
            })}
          </div> : <div className="empty-state">New features coming soon.</div>}
        </div>
      </section>
      <section className="about-section section-pad" id="about"><div className="container about-grid">
        <div className="about-art"><div className="about-note"><span className="note-dot" /><span>MY MONEY, MY WAY</span><h3>Progress over<br />perfection.</h3><div className="note-line" /><small>A gentle nudge, not a guilt trip.</small></div><div className="about-orb" /><span className="about-star">✳</span></div>
        <div className="about-copy"><span className="eyebrow">A MORE HUMAN MONEY APP</span><h2>{about?.title || 'Money clarity, without the pressure.'}</h2><p>{about?.body || 'We believe feeling good about money starts with understanding it. Spendora brings your day-to-day finances into focus, so you can make choices that feel like you.'}</p><Button variant="dark" onClick={onSignIn}>Get to know your money <ArrowRight size={17} /></Button></div>
      </div></section>
      <section className="updates-section section-pad" id="updates"><div className="container"><div className="updates-header"><div><span className="eyebrow">NOTES FROM SPENDORA</span><h2>Little things to keep<br />you in the loop.</h2></div><span className="update-caption">Ideas, updates, and gentle reminders for your money journey.</span></div>
        {updates.length ? <div className="updates-grid">{updates.map((item) => <article className="update-card" key={item.id}><span>THE SPENDORA JOURNAL · {new Date(item.updated_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span><h3>{item.title}</h3><p>{item.body}</p><a href="#contact">Read more <ArrowRight size={14} /></a></article>)}</div> : <div className="empty-state">No updates yet.</div>}
      </div></section>
      <section className="contact-section section-pad" id="contact"><div className="container contact-grid"><div><span className="eyebrow">WE’RE HERE FOR YOU</span><h2>Have a question?<br />Let's talk.</h2><p>We'd love to hear what's on your mind. Send us a note and our team will get back to you.</p><div className="contact-detail"><span><LifeBuoy size={18} /></span><div><b>Real people, real help</b><small>We usually reply within one business day.</small></div></div></div>
        <form className="contact-card stack-form" onSubmit={sendContact}><label>Your name<input value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} required maxLength={100} /></label><label>Email address<input type="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} required maxLength={254} /></label><label>Your message<textarea value={contact.message} onChange={(event) => setContact({ ...contact, message: event.target.value })} required minLength={10} maxLength={3000} rows="4" placeholder="Tell us what's on your mind…" /></label><Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send your message'} <ArrowRight size={16} /></Button></form>
      </div></section>
    </main>
    <footer className="public-footer"><div className="container footer-inner"><Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} /><p>Money clarity, made for real life.</p><nav aria-label="Footer navigation"><a href="#services">Services</a><a href="#about">About</a><a href="#updates">Updates</a><a href="#contact">Contact</a></nav><span>© 2026 Spendora. A little more peace of mind.</span></div></footer>
  </div>;
}

function Sidebar({ user, view, setView, logout, mobileOpen, closeMobile }) {
  const items = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', icon: CreditCard },
    { id: 'accounts', label: 'Accounts', icon: Landmark },
    { id: 'budgets', label: 'Budgets', icon: CircleDollarSign },
    { id: 'goals', label: 'Savings goals', icon: Goal },
    { id: 'bills', label: 'Recurring bills', icon: CalendarDays },
    { id: 'shared', label: 'Shared expenses', icon: Users },
  ];
  return <>
    {mobileOpen && <button className="sidebar-shade" onClick={closeMobile} aria-label="Close menu" />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Brand onClick={() => setView('overview')} /><button className="mobile-close" onClick={closeMobile} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-switch"><span className="workspace-icon">S</span><span><b>My workspace</b><small>Personal account</small></span><ChevronDown size={15} /></div>
      <span className="nav-caption">MENU</span>
      <nav className="side-nav" aria-label="Account navigation">{items.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); closeMobile(); }}><Icon size={18} />{label}</button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-tip"><span><Sparkles size={17} /></span><b>A little nudge</b><p>Every small step you take is a step toward your goals.</p><button onClick={() => setView('goals')}>View your goals <ArrowRight size={14} /></button><div className="tip-decoration">✳</div></div>
      <button className={`side-setting ${view === 'settings' ? 'active' : ''}`} onClick={() => { setView('settings'); closeMobile(); }}><Settings2 size={17} /> Settings</button>
      {user.role === 'admin' && <button className={`side-setting ${view === 'admin' ? 'active' : ''}`} onClick={() => { setView('admin'); closeMobile(); }}><ShieldCheck size={17} /> Admin portal</button>}
      <div className="sidebar-profile"><span className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span><b>{user.name}</b><small>{user.email}</small></span><button onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></div>
    </aside>
  </>;
}

function StatCard({ label, value, foot, icon: Icon, tone, change }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={18} /></span></div><strong>{value}</strong><div className="stat-foot">{change && <span className="stat-change"><ArrowUpRight size={13} />{change}</span>}<span>{foot}</span></div></article>;
}

function TransactionForm({ onClose, onSaved, setNotice }) {
  const [form, setForm] = useState({ kind: 'expense', amount: '', category: categories[0], description: '', occurredOn: new Date().toISOString().slice(0, 10), accountId: '' });
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/finance/accounts').then(({ accounts: rows }) => setAccounts(rows)).catch((error) => setNotice({ kind: 'error', text: error.message }));
  }, [setNotice]);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/finance/transactions', { method: 'POST', body: JSON.stringify({ ...form, accountId: form.accountId || null }) });
      setNotice({ kind: 'success', text: 'Transaction added.' });
      onSaved();
      onClose();
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="transaction-title">
    <div className="modal-title"><div><span className="eyebrow">KEEP YOUR MONEY IN FOCUS</span><h2 id="transaction-title">Add transaction</h2></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></div>
    <form className="stack-form" onSubmit={submit}>
      <div className="kind-toggle"><button type="button" className={form.kind === 'expense' ? 'selected expense' : ''} onClick={() => setForm({ ...form, kind: 'expense' })}>Expense</button><button type="button" className={form.kind === 'income' ? 'selected income' : ''} onClick={() => setForm({ ...form, kind: 'income' })}>Income</button></div>
      <label>Amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" required /></label>
      <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}{form.kind === 'income' && <option>Salary</option>}</select></label>
      {accounts.length > 0 && <label>Account <span className="optional">Optional</span><select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}><option value="">No account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}
      <label>Description <span className="optional">Optional</span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={240} placeholder="What was it for?" /></label>
      <label>Date<input type="date" value={form.occurredOn} onChange={(e) => setForm({ ...form, occurredOn: e.target.value })} required /></label>
      <div className="modal-actions"><Button variant="outline" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save transaction'}</Button></div>
    </form>
  </section></div>;
}

function BudgetForm({ onClose, onSaved, setNotice }) {
  const [category, setCategory] = useState(categories[0]);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/finance/budgets', { method: 'POST', body: JSON.stringify({ category, amount }) });
      setNotice({ kind: 'success', text: 'Budget saved for this month.' });
      onSaved();
      onClose();
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-title"><div><span className="eyebrow">MAKE A PLAN</span><h2>Set a monthly budget</h2></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></div><form className="stack-form" onSubmit={submit}><label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Monthly limit<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" /></label><div className="modal-actions"><Button variant="outline" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</Button></div></form></section></div>;
}

function GoalForm({ onClose, onSaved, setNotice }) {
  const [form, setForm] = useState({ name: '', targetAmount: '', targetDate: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/finance/goals', { method: 'POST', body: JSON.stringify({ ...form, targetDate: form.targetDate || undefined }) });
      setNotice({ kind: 'success', text: 'Savings goal created.' });
      onSaved();
      onClose();
    } catch (error) {
      setNotice({ kind: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };
  return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-title"><div><span className="eyebrow">YOUR NEXT BIG THING</span><h2>Create a savings goal</h2></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></div><form className="stack-form" onSubmit={submit}><label>Goal name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} required placeholder="A weekend away" /></label><label>Target amount<input type="number" min="0.01" step="0.01" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} required placeholder="0.00" /></label><label>Target date <span className="optional">Optional</span><input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label><div className="modal-actions"><Button variant="outline" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create goal'}</Button></div></form></section></div>;
}

function Overview({ data, loading, reload, setNotice, openTransaction, setView }) {
  const totals = data?.totals || {};
  const chartData = useMemo(() => {
    if (!data?.categories?.length) return [];
    return data.categories.map((item) => ({ name: item.category, amount: Number(item.amount) }));
  }, [data?.categories]);
  return <div className="view-content">
    <div className="welcome-row"><div><span className="eyebrow">YOUR MONEY AT A GLANCE</span><h1>Good to see you.</h1><p>Here's how things are looking today.</p></div><Button onClick={openTransaction}><Plus size={17} /> Add transaction</Button></div>
    <div className="stats-grid">
      <StatCard label="Total balance" value={currency(totals.balance)} foot="Across all your activity" icon={Wallet} tone="purple" />
      <StatCard label="Income this month" value={currency(totals.income)} foot="Money coming in" icon={ArrowDownLeft} tone="green" />
      <StatCard label="Spent this month" value={currency(totals.expenses)} foot="Money going out" icon={ArrowUpRight} tone="orange" />
      <StatCard label="Monthly savings" value={currency(Number(totals.income || 0) - Number(totals.expenses || 0))} foot="Income less expenses" icon={TrendingUp} tone="blue" />
    </div>
    <div className="dashboard-grid">
      <section className="panel spending-panel"><div className="panel-heading"><div><h2>Spending this month</h2><p>See where your money is going.</p></div><button className="panel-link" onClick={() => setView('transactions')}>View activity <ArrowRight size={14} /></button></div>
        {loading ? <div className="chart-empty">Loading your spending…</div> : chartData.length ? <div className="spending-content"><div className="donut-wrap"><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={chartData} dataKey="amount" nameKey="name" innerRadius={61} outerRadius={83} paddingAngle={4} stroke="none">{chartData.map((entry, index) => <Cell key={entry.name} fill={palette[index % palette.length]} />)}</Pie><Tooltip formatter={(value) => currency(value)} /></PieChart></ResponsiveContainer><div className="donut-center"><b>{currency(totals.expenses)}</b><small>spent so far</small></div></div>
          <div className="category-legend">{chartData.map((item, index) => <div key={item.name}><span><i style={{ background: palette[index % palette.length] }} />{item.name}</span><b>{currency(item.amount)}</b></div>)}</div></div> : <div className="chart-empty"><span className="empty-icon"><CircleDollarSign size={21} /></span><b>Your spending story starts here</b><p>Add an expense and your categories will show up here.</p><Button variant="soft" onClick={openTransaction}><Plus size={15} /> Add an expense</Button></div>}
      </section>
      <section className="panel budget-panel"><div className="panel-heading"><div><h2>Budget check-in</h2><p>Your monthly spending limits.</p></div><button className="icon-button" onClick={() => setView('budgets')} aria-label="View budgets"><ArrowRight size={17} /></button></div>
        {data?.budgets?.length ? <div className="budget-list">{data.budgets.slice(0, 4).map((budget, index) => {
          const percent = Math.min(100, Number(budget.spent) / Number(budget.amount) * 100);
          return <div className="budget-item" key={budget.id}><div className="budget-line"><span>{budget.category}</span><span><b>{currency(budget.spent)}</b> / {currency(budget.amount)}</span></div><div className="progress-track"><i className={percent > 85 ? 'progress-warn' : ''} style={{ width: `${percent}%`, backgroundColor: palette[index % palette.length] }} /></div></div>;
        })}</div> : <div className="empty-compact"><span className="empty-icon"><CircleDollarSign size={19} /></span><b>No budgets yet</b><p>Set a monthly limit and stay in your comfort zone.</p><Button variant="soft" onClick={() => setView('budgets')}>Create a budget <ArrowRight size={14} /></Button></div>}
      </section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Your latest money moves.</p></div><button className="panel-link" onClick={() => setView('transactions')}>All transactions <ArrowRight size={14} /></button></div>
      {data?.recent?.length ? <div className="table-scroll"><table><thead><tr><th>TRANSACTION</th><th>CATEGORY</th><th>DATE</th><th className="align-right">AMOUNT</th></tr></thead><tbody>{data.recent.map((item) => {
        const Icon = iconByCategory[item.category] || (item.kind === 'income' ? Landmark : CircleDollarSign);
        return <tr key={item.id}><td><span className="transaction-title"><span className={`transaction-icon ${item.kind}`}><Icon size={17} /></span><span><b>{item.description || item.category}</b><small>{item.kind === 'income' ? 'Income' : 'Expense'}</small></span></span></td><td><span className="category-pill">{item.category}</span></td><td>{new Date(`${item.occurred_on.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td className={`align-right amount-${item.kind}`}>{item.kind === 'income' ? '+' : '−'}{currency(item.amount)}</td></tr>;
      })}</tbody></table></div> : <div className="empty-table"><p>No transactions yet. Add your first one to get started.</p><Button variant="soft" onClick={openTransaction}><Plus size={15} /> Add transaction</Button></div>}
    </section>
    <div className="insight-banner"><span className="insight-mark"><Sparkles size={18} /></span><span><b>A little insight</b><small>{data?.budgets?.some((item) => Number(item.spent) > Number(item.amount)) ? 'One of your categories is over its budget. A quick check-in can help you reset your plan.' : 'Tracking just a few purchases can make it easier to spot your own spending patterns.'}</small></span><button onClick={reload} title="Refresh your data" aria-label="Refresh dashboard"><TrendingUp size={17} /></button></div>
  </div>;
}

function TransactionsView({ setNotice, reload }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [queryText, setQueryText] = useState('');
  const load = useCallback(() => api('/finance/transactions').then(({ transactions: list }) => setTransactions(list)).catch((error) => setNotice({ kind: 'error', text: error.message })).finally(() => setLoading(false)), [setNotice]);
  useEffect(() => { load(); }, [load]);
  const filtered = transactions.filter((item) => (filter === 'all' || item.kind === filter) &&
    `${item.category} ${item.description}`.toLowerCase().includes(queryText.toLowerCase()));
  const remove = async (id) => {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      await api(`/finance/transactions/${id}`, { method: 'DELETE' });
      setNotice({ kind: 'success', text: 'Transaction deleted.' });
      load(); reload();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  };
  return <div className="view-content"><div className="welcome-row"><div><span className="eyebrow">YOUR MONEY, YOUR RECORD</span><h1>Transactions</h1><p>Every little thing, all in one place.</p></div><Button onClick={() => window.dispatchEvent(new CustomEvent('open-transaction'))}><Plus size={17} /> Add transaction</Button></div>
    <section className="panel full-panel"><div className="list-toolbar"><div className="search-field"><Search size={17} /><input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Search activity…" aria-label="Search activity" /></div><div className="filter-tabs">{['all', 'expense', 'income'].map((type) => <button key={type} className={filter === type ? 'selected' : ''} onClick={() => setFilter(type)}>{type === 'all' ? 'All activity' : `${type[0].toUpperCase()}${type.slice(1)}s`}</button>)}</div></div>
      {loading ? <div className="empty-state">Loading transactions…</div> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>TRANSACTION</th><th>CATEGORY</th><th>DATE</th><th className="align-right">AMOUNT</th><th /></tr></thead><tbody>{filtered.map((item) => {
        const Icon = iconByCategory[item.category] || CircleDollarSign;
        return <tr key={item.id}><td><span className="transaction-title"><span className={`transaction-icon ${item.kind}`}><Icon size={17} /></span><span><b>{item.description || item.category}</b><small>{item.kind === 'income' ? 'Income' : 'Expense'}</small></span></span></td><td><span className="category-pill">{item.category}</span></td><td>{new Date(`${item.occurred_on.slice(0, 10)}T12:00:00`).toLocaleDateString()}</td><td className={`align-right amount-${item.kind}`}>{item.kind === 'income' ? '+' : '−'}{currency(item.amount)}</td><td><button className="icon-button danger-quiet" aria-label={`Delete ${item.description || item.category}`} onClick={() => remove(item.id)}><X size={16} /></button></td></tr>;
      })}</tbody></table></div> : <div className="empty-table"><p>{queryText ? 'No matching transactions.' : 'No transactions here yet.'}</p></div>}
    </section>
  </div>;
}

function BudgetsView({ data, reload, setNotice }) {
  const [showForm, setShowForm] = useState(false);
  return <div className="view-content"><div className="welcome-row"><div><span className="eyebrow">SPEND WITH INTENTION</span><h1>Your budgets</h1><p>Set a limit that feels right, and keep an eye on the little things.</p></div><Button onClick={() => setShowForm(true)}><Plus size={17} /> Set a budget</Button></div>
    <div className="budget-grid">{data?.budgets?.length ? data.budgets.map((budget, index) => {
      const amount = Number(budget.amount), spent = Number(budget.spent), percent = Math.min(100, amount ? spent / amount * 100 : 0);
      return <article className="budget-card" key={budget.id}><div className="budget-card-top"><span className={`service-icon service-icon-${index % 3}`}>{(() => { const Icon = iconByCategory[budget.category] || CircleDollarSign; return <Icon size={19} />; })()}</span><span className="budget-month">THIS MONTH</span></div><h3>{budget.category}</h3><div className="budget-big">{currency(spent)}<small> of {currency(amount)}</small></div><div className="progress-track large"><i style={{ width: `${percent}%`, backgroundColor: palette[index % palette.length] }} /></div><div className="budget-card-foot"><span>{Math.round(percent)}% used</span><b className={percent >= 100 ? 'over-budget' : ''}>{currency(Math.max(0, amount - spent))} left</b></div></article>;
    }) : <section className="panel empty-budget"><span className="empty-icon"><CircleDollarSign size={22} /></span><h3>Your budget starts with one category.</h3><p>Choose something you spend on often and set a monthly limit that works for you.</p><Button onClick={() => setShowForm(true)}><Plus size={17} /> Set your first budget</Button></section>}</div>
    {showForm && <BudgetForm onClose={() => setShowForm(false)} onSaved={reload} setNotice={setNotice} />}
  </div>;
}

function GoalsView({ data, reload, setNotice }) {
  const [showForm, setShowForm] = useState(false);
  const [amounts, setAmounts] = useState({});
  const updateProgress = async (goal) => {
    const amount = amounts[goal.id];
    if (amount === undefined || amount === '') return;
    try {
      await api(`/finance/goals/${goal.id}`, { method: 'PATCH', body: JSON.stringify({ savedAmount: amount }) });
      setNotice({ kind: 'success', text: 'Goal progress updated.' });
      reload();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  };
  return <div className="view-content"><div className="welcome-row"><div><span className="eyebrow">SAVE FOR WHAT MATTERS</span><h1>Savings goals</h1><p>Big dreams are just small steps with a name.</p></div><Button onClick={() => setShowForm(true)}><Plus size={17} /> New goal</Button></div>
    {data?.goals?.length ? <div className="goals-grid">{data.goals.map((goal, index) => {
      const percent = Math.min(100, Number(goal.saved_amount) / Number(goal.target_amount) * 100);
      return <article className="goal-card" key={goal.id}><div className="goal-card-icon" style={{ background: `${palette[index % palette.length]}18`, color: palette[index % palette.length] }}><Goal size={21} /></div><span className="goal-caption">SAVING FOR</span><h3>{goal.name}</h3><div className="goal-progress-amount"><b>{currency(goal.saved_amount)}</b><span>of {currency(goal.target_amount)}</span></div><div className="progress-track large"><i style={{ width: `${percent}%`, backgroundColor: palette[index % palette.length] }} /></div><div className="goal-card-foot"><span>{Math.round(percent)}% there</span><span>{goal.target_date ? `Target ${new Date(`${goal.target_date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : 'One step at a time'}</span></div><div className="goal-update"><input type="number" min="0" step="0.01" placeholder="Update saved amount" value={amounts[goal.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [goal.id]: e.target.value })} aria-label={`Update amount saved for ${goal.name}`} /><Button variant="soft" onClick={() => updateProgress(goal)}>Update</Button></div></article>;
    })}</div> : <section className="panel empty-budget"><span className="empty-icon"><Goal size={22} /></span><h3>What are you saving for?</h3><p>A trip, a rainy day, a new chapter — give your next goal a name.</p><Button onClick={() => setShowForm(true)}><Plus size={17} /> Create a savings goal</Button></section>}
    {showForm && <GoalForm onClose={() => setShowForm(false)} onSaved={reload} setNotice={setNotice} />}
  </div>;
}

function AccountsView({ setNotice }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', accountType: 'cash', openingBalance: '0' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/finance/accounts').then(({ accounts: rows }) => setAccounts(rows)).catch((error) => setNotice({ kind: 'error', text: error.message })).finally(() => setLoading(false)), [setNotice]);
  useEffect(() => { load(); }, [load]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await api('/finance/accounts', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', accountType: 'cash', openingBalance: '0' });
      setNotice({ kind: 'success', text: 'Account added.' }); load();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setBusy(false); }
  };
  return <div className="view-content"><div className="welcome-row"><div><span className="eyebrow">ALL YOUR MONEY, TOGETHER</span><h1>Accounts</h1><p>Keep your cash, bank, and wallet balances in one view.</p></div></div><div className="settings-grid">
    <section className="panel settings-panel"><div className="panel-heading"><div><h2>Add an account</h2><p>Start with a cash wallet or another account.</p></div><span className="settings-icon"><Landmark size={18} /></span></div><form className="stack-form" onSubmit={submit}><label>Account name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} placeholder="Everyday checking" /></label><label>Type<select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank</option><option value="credit">Credit</option><option value="wallet">Wallet</option></select></label><label>Starting balance<input type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} required /></label><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add account'}</Button></form></section>
    <section className="panel settings-panel"><div className="panel-heading"><div><h2>Your accounts</h2><p>Balances include opening amounts and linked transactions.</p></div><span className="settings-icon"><Wallet size={18} /></span></div>{loading ? <div className="empty-state">Loading accounts…</div> : accounts.length ? <div className="account-list">{accounts.map((account, index) => <div className="account-row" key={account.id}><span className={`service-icon service-icon-${index % 3}`}><Landmark size={18} /></span><span><b>{account.name}</b><small>{account.account_type}</small></span><strong>{currency(account.balance)}</strong></div>)}</div> : <div className="empty-compact"><b>No accounts yet</b><p>Add your starting balance to get a more complete picture.</p></div>}</section>
  </div></div>;
}

function BillsView({ setNotice }) {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', amount: '', category: categories[0], frequency: 'monthly', nextDueOn: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/finance/bills').then(({ bills: rows }) => setBills(rows)).catch((error) => setNotice({ kind: 'error', text: error.message })).finally(() => setLoading(false)), [setNotice]);
  useEffect(() => { load(); }, [load]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await api('/finance/bills', { method: 'POST', body: JSON.stringify(form) });
      setNotice({ kind: 'success', text: 'Recurring bill added.' }); setShowForm(false);
      setForm({ name: '', amount: '', category: categories[0], frequency: 'monthly', nextDueOn: new Date().toISOString().slice(0, 10) }); load();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const toggle = async (bill) => {
    try { await api(`/finance/bills/${bill.id}`, { method: 'PATCH', body: JSON.stringify({ active: !bill.active }) }); load(); }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
  };
  const remove = async (bill) => {
    if (!window.confirm(`Remove "${bill.name}" from your recurring bills?`)) return;
    try { await api(`/finance/bills/${bill.id}`, { method: 'DELETE' }); load(); setNotice({ kind: 'success', text: 'Recurring bill removed.' }); }
    catch (error) { setNotice({ kind: 'error', text: error.message }); }
  };
  return <div className="view-content"><div className="welcome-row"><div><span className="eyebrow">STAY A STEP AHEAD</span><h1>Recurring bills</h1><p>Keep regular payments visible before they sneak up on you.</p></div><Button onClick={() => setShowForm(true)}><Plus size={17} /> Add a bill</Button></div>
    <section className="panel full-panel"><div className="panel-heading"><div><h2>Upcoming payments</h2><p>Manage the recurring payments you want to keep an eye on.</p></div></div>
      {loading ? <div className="empty-state">Loading bills…</div> : bills.length ? <div className="bill-list">{bills.map((bill, index) => <article className={`bill-row ${bill.active ? '' : 'bill-inactive'}`} key={bill.id}><span className={`service-icon service-icon-${index % 3}`}><CalendarDays size={18} /></span><span className="bill-name"><b>{bill.name}</b><small>{bill.category} · {bill.frequency}</small></span><span className="bill-due"><b>{new Date(`${bill.next_due_on.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</b><small>{bill.active ? 'Next due' : 'Paused'}</small></span><strong>{currency(bill.amount)}</strong><div className="bill-actions"><button className="icon-button" onClick={() => toggle(bill)} title={bill.active ? 'Pause bill' : 'Resume bill'} aria-label={bill.active ? `Pause ${bill.name}` : `Resume ${bill.name}`}>{bill.active ? <Pause size={15} /> : <Play size={15} />}</button><button className="icon-button danger-quiet" onClick={() => remove(bill)} title="Remove bill" aria-label={`Remove ${bill.name}`}><X size={15} /></button></div></article>)}</div> : <div className="empty-table"><span className="empty-icon"><CalendarDays size={20} /></span><p>No recurring bills yet. Add a rent, subscription, or other regular payment.</p><Button variant="soft" onClick={() => setShowForm(true)}><Plus size={15} /> Add a bill</Button></div>}
    </section>
    {showForm && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-title"><div><span className="eyebrow">PLAN FOR WHAT'S NEXT</span><h2>Add a recurring bill</h2></div><button onClick={() => setShowForm(false)} aria-label="Close"><X size={20} /></button></div><form className="stack-form" onSubmit={submit}><label>Bill name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} placeholder="Internet subscription" /></label><label>Amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Repeats<select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label>Next due date<input type="date" value={form.nextDueOn} onChange={(e) => setForm({ ...form, nextDueOn: e.target.value })} required /></label><div className="modal-actions"><Button variant="outline" type="button" onClick={() => setShowForm(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save bill'}</Button></div></form></section></div>}
  </div>;
}

function SharedView({ user, setNotice }) {
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState('');
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [email, setEmail] = useState('');
  const [form, setForm] = useState({ description: '', amount: '', category: categories[0], occurredOn: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const loadGroups = useCallback(() => api('/finance/groups').then(({ groups: rows }) => {
    setGroups(rows);
    if (!activeGroup && rows.length) setActiveGroup(String(rows[0].id));
  }).catch((error) => setNotice({ kind: 'error', text: error.message })), [activeGroup, setNotice]);
  useEffect(() => { loadGroups(); }, [loadGroups]);
  const loadGroup = useCallback(async () => {
    if (!activeGroup) { setMembers([]); setExpenses([]); return; }
    try {
      const [memberResult, expenseResult] = await Promise.all([
        api(`/finance/groups/${activeGroup}/members`),
        api(`/finance/groups/${activeGroup}/expenses`),
      ]);
      setMembers(memberResult.members); setExpenses(expenseResult.expenses);
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  }, [activeGroup, setNotice]);
  useEffect(() => { loadGroup(); }, [loadGroup]);
  const createGroup = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const { group } = await api('/finance/groups', { method: 'POST', body: JSON.stringify({ name: groupName }) });
      setGroups((current) => [group, ...current]); setActiveGroup(String(group.id)); setGroupName(''); setShowGroupForm(false);
      setNotice({ kind: 'success', text: 'Shared group created.' });
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const addMember = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await api(`/finance/groups/${activeGroup}/members`, { method: 'POST', body: JSON.stringify({ email }) });
      setEmail(''); await loadGroup(); await loadGroups(); setNotice({ kind: 'success', text: 'Group member added.' });
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const createExpense = async (event) => {
    event.preventDefault(); setBusy(true);
    const totalCents = Math.round(Number(form.amount) * 100);
    const each = Math.floor(totalCents / members.length);
    const remainder = totalCents - each * members.length;
    if (!members.length || each < 1) {
      setNotice({ kind: 'error', text: 'Add group members and use an amount that can be split between them.' });
      setBusy(false); return;
    }
    const splits = members.map((member, index) => ({ userId: member.id, amount: (each + (index === 0 ? remainder : 0)) / 100 }));
    try {
      await api(`/finance/groups/${activeGroup}/expenses`, { method: 'POST', body: JSON.stringify({ ...form, splits }) });
      setShowExpenseForm(false); setForm({ description: '', amount: '', category: categories[0], occurredOn: new Date().toISOString().slice(0, 10) });
      await loadGroup(); setNotice({ kind: 'success', text: 'Shared expense added and split evenly.' });
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const settle = async (expense, split, settled) => {
    try {
      await api(`/finance/groups/${activeGroup}/expenses/${expense.id}/settlement`, { method: 'PATCH', body: JSON.stringify({ settled }) });
      await loadGroup();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  };
  const active = groups.find((group) => String(group.id) === String(activeGroup));
  return <div className="view-content"><div className="welcome-row"><div><span className="eyebrow">MAKE THE SHARED STUFF SIMPLE</span><h1>Shared expenses</h1><p>Keep roommate, trip, or group spending transparent.</p></div><Button onClick={() => setShowGroupForm(true)}><Plus size={17} /> New group</Button></div>
    <div className="shared-layout"><section className="panel shared-groups"><div className="panel-heading"><div><h2>Your groups</h2><p>People you share costs with.</p></div></div>{groups.length ? <div className="group-list">{groups.map((group) => <button key={group.id} className={String(group.id) === String(activeGroup) ? 'selected' : ''} onClick={() => setActiveGroup(String(group.id))}><span className="group-symbol"><Users size={17} /></span><span><b>{group.name}</b><small>{group.member_count} members</small></span><ArrowRight size={15} /></button>)}</div> : <div className="empty-compact"><b>No shared groups yet</b><p>Create a group and invite people to split shared expenses.</p><Button variant="soft" onClick={() => setShowGroupForm(true)}>Create a group</Button></div>}</section>
      <section className="panel shared-details">{active ? <><div className="panel-heading"><div><h2>{active.name}</h2><p>{members.length} members · shared expenses are split evenly.</p></div><Button variant="soft" onClick={() => setShowExpenseForm(true)}><Plus size={15} /> Add expense</Button></div>
        <form className="invite-form" onSubmit={addMember}><div className="search-field"><UserPlus size={16} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Invite by account email…" aria-label="Invite a group member by email" /></div><Button type="submit" disabled={busy}>Invite</Button></form>
        <div className="member-chips">{members.map((member) => <span key={member.id} title={member.email}><i>{member.name.slice(0, 1).toUpperCase()}</i>{member.name}{String(member.id) === String(user.id) && ' (you)'}</span>)}</div>
        <div className="shared-expense-list">{expenses.length ? expenses.map((expense) => <article className="shared-expense" key={expense.id}><div className="shared-expense-top"><span className="transaction-icon"><CreditCard size={16} /></span><span><b>{expense.description}</b><small>{expense.category} · paid by {expense.paid_by} · {new Date(`${expense.occurred_on.slice(0, 10)}T12:00:00`).toLocaleDateString()}</small></span><strong>{currency(expense.amount)}</strong></div><div className="split-list">{expense.splits.map((split) => <div key={split.userId}><span>{split.name}</span><b>{currency(split.amount)}</b>{String(split.userId) === String(user.id) ? <button className={split.settledAt ? 'settled' : ''} onClick={() => settle(expense, split, !split.settledAt)}>{split.settledAt ? 'Settled' : 'Mark settled'}</button> : <small>{split.settledAt ? 'Settled' : 'Pending'}</small>}</div>)}</div></article>) : <div className="empty-table"><p>No shared expenses in this group yet.</p></div>}</div>
      </> : <div className="empty-budget"><span className="empty-icon"><Users size={21} /></span><h3>Start a group to share the load.</h3><p>Invite roommates or travel buddies, then log expenses and see who has settled up.</p><Button onClick={() => setShowGroupForm(true)}><Plus size={16} /> Create a group</Button></div>}</section>
    </div>
    {showGroupForm && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-title"><div><span className="eyebrow">BETTER TOGETHER</span><h2>Create a shared group</h2></div><button onClick={() => setShowGroupForm(false)} aria-label="Close"><X size={20} /></button></div><form className="stack-form" onSubmit={createGroup}><label>Group name<input value={groupName} onChange={(e) => setGroupName(e.target.value)} required maxLength={100} placeholder="Weekend away or Apartment 4B" /></label><div className="modal-actions"><Button variant="outline" type="button" onClick={() => setShowGroupForm(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</Button></div></form></section></div>}
    {showExpenseForm && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true"><div className="modal-title"><div><span className="eyebrow">SHARE THE DETAILS</span><h2>Add a shared expense</h2></div><button onClick={() => setShowExpenseForm(false)} aria-label="Close"><X size={20} /></button></div><form className="stack-form" onSubmit={createExpense}><label>Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required maxLength={240} placeholder="Groceries for the week" /></label><label>Total amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Date<input type="date" value={form.occurredOn} onChange={(e) => setForm({ ...form, occurredOn: e.target.value })} required /></label><p className="field-help">This expense will be split evenly across {members.length} group {members.length === 1 ? 'member' : 'members'}.</p><div className="modal-actions"><Button variant="outline" type="button" onClick={() => setShowExpenseForm(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add expense'}</Button></div></form></section></div>}
  </div>;
}

function SettingsView({ user, setUser, setNotice }) {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const saveName = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { user: updated } = await api('/profile', { method: 'PATCH', body: JSON.stringify({ name }) });
      setUser(updated);
      setNotice({ kind: 'success', text: 'Profile updated.' });
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const savePassword = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { message } = await api('/profile/password', { method: 'PATCH', body: JSON.stringify(password) });
      setPassword({ currentPassword: '', newPassword: '' });
      setNotice({ kind: 'success', text: message });
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setBusy(false); }
  };
  return <div className="view-content"><div className="welcome-row"><div><span className="eyebrow">YOUR ACCOUNT, YOUR WAY</span><h1>Settings</h1><p>Keep your profile and account details up to date.</p></div></div><div className="settings-grid">
    <section className="panel settings-panel"><div className="panel-heading"><div><h2>Personal details</h2><p>Change how we know you.</p></div><span className="settings-icon"><Settings2 size={18} /></span></div><form className="stack-form" onSubmit={saveName}><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></label><label>Email address<input value={user.email} disabled /></label><Button type="submit" disabled={busy}>Save changes</Button></form></section>
    <section className="panel settings-panel"><div className="panel-heading"><div><h2>Change password</h2><p>Keep your account secure.</p></div><span className="settings-icon"><ShieldCheck size={18} /></span></div><form className="stack-form" onSubmit={savePassword}><label>Current password<input type="password" autoComplete="current-password" value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} required /></label><label>New password<input type="password" autoComplete="new-password" minLength={10} maxLength={72} value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} required /><small className="field-help">Use at least 10 characters.</small></label><Button type="submit" disabled={busy}>Update password</Button></form></section>
  </div></div>;
}

function AdminView({ setNotice }) {
  const [tab, setTab] = useState('analytics');
  const [analytics, setAnalytics] = useState(null);
  const [content, setContent] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [users, setUsers] = useState([]);
  const [queryText, setQueryText] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try {
      const [stats, records, inbox] = await Promise.all([
        api('/admin/analytics'), api('/admin/content'), api('/admin/contacts'),
      ]);
      setAnalytics(stats);
      setContent(records.content);
      setContacts(inbox.submissions);
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  }, [setNotice]);
  const loadUsers = useCallback(async () => {
    try {
      const result = await api(`/admin/users?search=${encodeURIComponent(queryText)}&page=${page}&limit=10`);
      setUsers(result.users); setTotal(result.total);
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  }, [queryText, page, setNotice]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (tab === 'users') loadUsers(); }, [tab, loadUsers]);
  const togglePublish = async (item) => {
    try {
      await api(`/admin/content/${item.id}`, { method: 'PATCH', body: JSON.stringify({ slug: item.slug, title: item.title, body: item.body, contentType: item.content_type, published: !item.published }) });
      setNotice({ kind: 'success', text: `Content ${item.published ? 'unpublished' : 'published'}.` });
      reload();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  };
  const deleteContent = async (item) => {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    try {
      await api(`/admin/content/${item.id}`, { method: 'DELETE' });
      setNotice({ kind: 'success', text: 'Content deleted.' });
      reload();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  };
  const saveContent = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const payload = {
        slug: edit.slug, title: edit.title, body: edit.body,
        contentType: edit.contentType || 'page', published: Boolean(edit.published),
      };
      await api(edit.id ? `/admin/content/${edit.id}` : '/admin/content', { method: edit.id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      setNotice({ kind: 'success', text: 'Content saved.' }); setEdit(null); reload();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); } finally { setBusy(false); }
  };
  const updateRole = async (user, role) => {
    try {
      await api(`/admin/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setNotice({ kind: 'success', text: 'User role updated.' }); loadUsers();
    } catch (error) { setNotice({ kind: 'error', text: error.message }); }
  };
  const exportUsers = () => {
    const csvField = (value) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const csv = ['Name,Email,Role,Status,Joined', ...users.map((user) => [user.name, user.email, user.role, user.status, user.created_at].map(csvField).join(','))].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'spendora-users.csv'; link.click(); URL.revokeObjectURL(link.href);
  };
  return <div className="view-content admin-view"><div className="welcome-row"><div><span className="eyebrow"><ShieldCheck size={13} /> SECURE WORKSPACE</span><h1>Admin portal</h1><p>Manage your website and get a feel for how things are going.</p></div><Button variant="outline" onClick={() => window.open('/', '_blank')}><ArrowRight size={15} /> View website</Button></div>
    <div className="admin-tabs">{[['analytics', 'Overview'], ['content', 'Website content'], ['users', 'People'], ['contacts', 'Contact inbox']].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'analytics' && <>    <div className="stats-grid admin-stats"><StatCard label="Registered users" value={analytics?.counts?.users ?? '—'} foot="All registered accounts" icon={Wallet} tone="purple" /><StatCard label="New this month" value={analytics?.counts?.new_users ?? '—'} foot="Last 30 days" icon={TrendingUp} tone="green" /><StatCard label="Published content" value={analytics?.counts?.published_content ?? '—'} foot="Pages and updates" icon={FileText} tone="orange" /><StatCard label="Page views" value={analytics?.counts?.page_views ?? '—'} foot="All-time tracked views" icon={ArrowUpRight} tone="blue" /></div>
      <div className="dashboard-grid admin-chart-grid"><section className="panel spending-panel"><div className="panel-heading"><div><h2>Website activity</h2><p>Daily page views in the last 30 days.</p></div></div>{analytics?.viewsOverTime?.length ? <div className="admin-line-chart"><ResponsiveContainer width="100%" height={250}><AreaChart data={analytics.viewsOverTime}><defs><linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8057ec" stopOpacity={0.22} /><stop offset="100%" stopColor="#8057ec" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eeedf3" /><XAxis dataKey="day" tickFormatter={(day) => new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} axisLine={false} tickLine={false} tick={{ fill: '#9996a8', fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#9996a8', fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="views" stroke="#8057ec" fill="url(#viewsGradient)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div> : <div className="chart-empty"><b>No website activity yet</b><p>Page views appear here once visitors browse the site.</p></div>}</section>
        <section className="panel budget-panel"><div className="panel-heading"><div><h2>Most visited</h2><p>Pages people are exploring.</p></div></div>{analytics?.popularPages?.length ? <div className="popular-list">{analytics.popularPages.map((item, index) => <div key={item.path}><span className="popular-rank">{String(index + 1).padStart(2, '0')}</span><span><b>{item.path}</b><small>Page views</small></span><strong>{item.views}</strong></div>)}</div> : <div className="empty-compact"><b>No page views recorded</b><p>Analytics will fill in as people visit your site.</p></div>}</section></div>
      <section className="panel full-panel activity-panel"><div className="panel-heading"><div><h2>Recent admin activity</h2><p>Important content and account changes.</p></div></div>{analytics?.recentActivity?.length ? <div className="activity-list">{analytics.recentActivity.map((item) => <div key={item.id}><span className="activity-mark"><ShieldCheck size={15} /></span><span><b>{item.action.replaceAll('.', ' ')}</b><small>{item.target_type}{item.target_id ? ` · #${item.target_id}` : ''}</small></span><time>{new Date(item.created_at).toLocaleString()}</time></div>)}</div> : <div className="empty-table"><p>No administrative actions recorded yet.</p></div>}</section>
    </>}
    {tab === 'content' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Website content</h2><p>Published content appears on the public website as it is fetched.</p></div><Button onClick={() => setEdit({ slug: '', title: '', body: '', contentType: 'page', published: false })}><Plus size={16} /> New content</Button></div>
      <div className="table-scroll"><table><thead><tr><th>TITLE</th><th>TYPE</th><th>STATUS</th><th>UPDATED</th><th>ACTIONS</th></tr></thead><tbody>{content.map((item) => <tr key={item.id}><td><span className="content-title"><b>{item.title}</b><small>/{item.slug}</small></span></td><td><span className="category-pill">{item.content_type}</span></td><td><span className={`status-pill ${item.published ? 'published' : ''}`}>{item.published ? 'Published' : 'Draft'}</span></td><td>{new Date(item.updated_at).toLocaleDateString()}</td><td><div className="row-actions"><button onClick={() => setEdit({ ...item, contentType: item.content_type })}>Edit</button><button onClick={() => togglePublish(item)}>{item.published ? 'Unpublish' : 'Publish'}</button><button className="danger-text" onClick={() => deleteContent(item)}>Delete</button></div></td></tr>)}</tbody></table></div>
      {!content.length && <div className="empty-table"><p>No editable content yet.</p></div>}
    </section>}
    {tab === 'users' && <section className="panel full-panel"><div className="panel-heading"><div><h2>People</h2><p>Search accounts and manage roles. Admin actions are recorded.</p></div><Button variant="outline" onClick={exportUsers} disabled={!users.length}><Download size={16} /> Export CSV</Button></div><div className="list-toolbar"><div className="search-field"><Search size={17} /><input value={queryText} onChange={(e) => { setPage(1); setQueryText(e.target.value); }} placeholder="Search by name or email…" /></div><span className="user-count">{total} {total === 1 ? 'person' : 'people'}</span></div>
      <div className="table-scroll"><table><thead><tr><th>PERSON</th><th>ROLE</th><th>STATUS</th><th>JOINED</th><th>CHANGE ROLE</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><span className="user-table-cell"><i>{item.name.slice(0, 1).toUpperCase()}</i><span><b>{item.name}</b><small>{item.email}</small></span></span></td><td><span className={`status-pill ${item.role === 'admin' ? 'published' : ''}`}>{item.role}</span></td><td><span className="status-pill published">{item.status}</span></td><td>{new Date(item.created_at).toLocaleDateString()}</td><td><select className="role-select" value={item.role} onChange={(e) => updateRole(item, e.target.value)} aria-label={`Role for ${item.name}`}><option value="user">User</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div>
      <div className="pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(total / 10))}</span><button disabled={page * 10 >= total} onClick={() => setPage(page + 1)}>Next</button></div>
    </section>}
    {tab === 'contacts' && <section className="panel full-panel"><div className="panel-heading"><div><h2>Contact inbox</h2><p>Messages sent through the public contact form.</p></div></div>{contacts.length ? <div className="table-scroll"><table><thead><tr><th>FROM</th><th>MESSAGE</th><th>RECEIVED</th></tr></thead><tbody>{contacts.map((item) => <tr key={item.id}><td><span className="content-title"><b>{item.name}</b><small>{item.email}</small></span></td><td className="contact-message-cell">{item.message}</td><td>{new Date(item.created_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="empty-table"><p>Your inbox is clear. New contact messages will show up here.</p></div>}</section>}
    {edit && <div className="modal-backdrop"><section className="modal-card content-modal" role="dialog" aria-modal="true"><div className="modal-title"><div><span className="eyebrow">DYNAMIC WEBSITE CONTENT</span><h2>{edit.id ? 'Edit content' : 'Create content'}</h2></div><button onClick={() => setEdit(null)} aria-label="Close"><X size={20} /></button></div><form className="stack-form" onSubmit={saveContent}><label>Title<input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required maxLength={180} /></label><label>URL slug<input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={180} /></label><label>Content type<select value={edit.contentType} onChange={(e) => setEdit({ ...edit, contentType: e.target.value })}><option value="page">Page</option><option value="service">Service</option><option value="update">Update</option></select></label><label>Body<textarea rows="6" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} required maxLength={20000} /></label><label className="checkbox-label"><input type="checkbox" checked={Boolean(edit.published)} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} /> Publish on the public website</label><div className="modal-actions"><Button variant="outline" type="button" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save content'}</Button></div></form></section></div>}
  </div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [notice, setNotice] = useState(null);
  const resolveView = () => {
    const route = window.location.pathname.replace(/^\/+|\/+$/g, '');
    return ['overview', 'transactions', 'accounts', 'budgets', 'goals', 'bills', 'shared', 'settings', 'admin'].includes(route)
      ? route
      : 'overview';
  };
  const [view, setView] = useState(resolveView);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showTransaction, setShowTransaction] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const navigateView = useCallback((nextView) => {
    setView(nextView);
    const path = nextView === 'overview' ? '/' : `/${nextView}`;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
  }, []);

  useEffect(() => {
    api('/auth/me')
      .then(({ user: current }) => setUser(current))
      .catch((error) => {
        if (error.status !== 401) setNotice({ kind: 'error', text: error.message });
      })
      .finally(() => setAuthChecked(true));
  }, []);
  useEffect(() => {
    const onHistoryChange = () => setView(resolveView());
    window.addEventListener('popstate', onHistoryChange);
    return () => window.removeEventListener('popstate', onHistoryChange);
  }, []);
  const loadDashboard = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api('/finance/summary').then(setData).catch((error) => setNotice({ kind: 'error', text: error.message })).finally(() => setLoading(false));
  }, [user]);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    const open = () => setShowTransaction(true);
    window.addEventListener('open-transaction', open);
    return () => window.removeEventListener('open-transaction', open);
  }, []);
  const setTransientNotice = useCallback((value) => {
    setNotice(value);
    if (value) window.setTimeout(() => setNotice((current) => current === value ? null : current), 5200);
  }, []);
  const signOut = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (error) { setTransientNotice({ kind: 'error', text: error.message }); }
    setUser(null); setData(null); navigateView('overview');
  };
  useEffect(() => {
    if (user && view === 'admin' && user.role !== 'admin') navigateView('overview');
  }, [user, view, navigateView]);

  if (!authChecked) return <div className="boot-screen"><span className="brand-mark"><Wallet size={18} /></span><span>Getting your space ready…</span></div>;
  if (!user) return <><Notice notice={notice} dismiss={() => setNotice(null)} />{signIn || ['/admin', '/verify-email', '/reset-password'].includes(window.location.pathname) ? <AuthScreen onAuthenticated={(current) => { setUser(current); setSignIn(false); }} setNotice={setTransientNotice} /> : <PublicHome onSignIn={() => setSignIn(true)} setNotice={setTransientNotice} />}</>;
  return <div className="app-shell">
    <Sidebar user={user} view={view} setView={navigateView} logout={signOut} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
    <main className="main-area"><header className="topbar"><button className="menu-toggle" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb"><span>My workspace</span><span>/</span><b>{view === 'admin' ? 'Admin portal' : view === 'settings' ? 'Settings' : view === 'overview' ? 'Overview' : view === 'goals' ? 'Savings goals' : view === 'shared' ? 'Shared expenses' : view === 'bills' ? 'Recurring bills' : view[0].toUpperCase() + view.slice(1)}</b></div><div className="topbar-actions"><button className="help-button" aria-label="Help"><CircleHelp size={19} /></button><span className="topbar-separator" /><button className="topbar-user" onClick={() => navigateView('settings')}><span className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name.split(' ')[0]}</span><ChevronDown size={15} /></button></div></header>
      <div className="main-content">
        {view === 'overview' && <Overview data={data} loading={loading} reload={loadDashboard} setNotice={setTransientNotice} openTransaction={() => setShowTransaction(true)} setView={navigateView} />}
        {view === 'transactions' && <TransactionsView setNotice={setTransientNotice} reload={loadDashboard} />}
        {view === 'accounts' && <AccountsView setNotice={setTransientNotice} />}
        {view === 'budgets' && <BudgetsView data={data} reload={loadDashboard} setNotice={setTransientNotice} />}
        {view === 'goals' && <GoalsView data={data} reload={loadDashboard} setNotice={setTransientNotice} />}
        {view === 'bills' && <BillsView setNotice={setTransientNotice} />}
        {view === 'shared' && <SharedView user={user} setNotice={setTransientNotice} />}
        {view === 'settings' && <SettingsView user={user} setUser={setUser} setNotice={setTransientNotice} />}
        {view === 'admin' && <AdminView setNotice={setTransientNotice} />}
      </div>
      <footer className="app-footer"><span>Made for your next chapter <span className="footer-heart">✦</span></span><span>Spendora · Your money, in focus.</span></footer>
    </main>
    <Notice notice={notice} dismiss={() => setNotice(null)} />
    {showTransaction && <TransactionForm onClose={() => setShowTransaction(false)} onSaved={loadDashboard} setNotice={setTransientNotice} />}
  </div>;
}

export default App;
