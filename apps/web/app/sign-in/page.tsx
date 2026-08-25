'use client';

import { FormEvent, useState } from 'react';

function OfficeMark() {
  return <svg aria-hidden="true" className="auth-logo-mark" fill="none" viewBox="0 0 48 48"><path d="M8 15.5 24 6l16 9.5v17L24 42 8 32.5v-17Z" fill="currentColor" opacity=".18" /><path d="M8 15.5 24 25l16-9.5M24 25v17M8 15.5v17L24 42M40 15.5v17L24 42" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" /><path d="m17.5 20.8 6.5 3.8 6.5-3.8M24 24.6v7.6" stroke="currentColor" strokeLinecap="round" strokeWidth="2.6" /></svg>;
}

function EyeIcon({ visible }: { visible: boolean }) {
  return visible
    ? <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M3 3l18 18M10.7 10.8a2 2 0 0 0 2.6 2.6M9.9 5.1A10.9 10.9 0 0 1 12 4.9c5.2 0 8.6 4.2 9.6 6.1a1.9 1.9 0 0 1 0 1.8 14 14 0 0 1-3.1 3.8M6.1 6.1A14 14 0 0 0 2.4 11a1.9 1.9 0 0 0 0 1.8c1 1.9 4.4 6.1 9.6 6.1 1.4 0 2.7-.3 3.8-.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
    : <svg aria-hidden="true" fill="none" viewBox="0 0 24 24"><path d="M2.5 12s3.4-6.5 9.5-6.5S21.5 12 21.5 12 18.1 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

export default function SignInPage() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) return;
    setSubmitting(true);
    setError('');
    const values = new FormData(form);
    try {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: values.get('email'), password: values.get('password') })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        setError(body?.message ?? 'Email yoki parol noto‘g‘ri. Qayta urinib ko‘ring.');
        return;
      }
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');
      window.location.assign(returnTo?.startsWith('/') ? returnTo : '/office');
    } catch {
      setError('Tarmoqqa ulanib bo‘lmadi. Qayta urinib ko‘ring.');
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="auth-page">
    <div aria-hidden="true" className="auth-orb auth-orb-one" />
    <div aria-hidden="true" className="auth-orb auth-orb-two" />
    <section className="auth-hero" aria-label="AI Office overview">
      <a className="auth-brand" href="/office" aria-label="AI Office home"><OfficeMark /><span>AI Office</span></a>
      <div className="auth-hero-copy"><p className="auth-kicker"><span /> LIVE AGENT WORKSPACE</p><h1>See your AI team<br />at work.</h1><p>One room for every project. Direct tasks, follow agent activity, and review real deliverables as they arrive.</p></div>
      <div className="auth-activity-card"><div className="auth-activity-head"><span>Product redesign</span><b>LIVE</b></div><div className="auth-activity-row"><i className="auth-agent-dot dot-codex" /><span>Codex</span><small>Building interface</small></div><div className="auth-activity-row"><i className="auth-agent-dot dot-claude" /><span>Claude</span><small>Reviewing brief</small></div><div className="auth-activity-row"><i className="auth-agent-dot dot-gemini" /><span>Gemini</span><small>Researching</small></div></div>
      <p className="auth-footer-note">Private by workspace. Clear by design.</p>
    </section>
    <section className="auth-panel-wrap"><div className="auth-panel">
      <div className="auth-panel-heading"><p className="auth-eyebrow">INTERNAL ACCESS</p><h2>Welcome back</h2><p>Sign in to enter your workspace.</p></div>
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></div>
        <div className="auth-field"><div className="auth-label-row"><label htmlFor="password">Password</label><a href="mailto:admin@ai-office.local?subject=Password%20reset">Forgot password?</a></div><div className="auth-password-wrap"><input id="password" name="password" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required /><button className="auth-password-toggle" type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'}><EyeIcon visible={passwordVisible} /></button></div></div>
        <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? <><span className="auth-spinner" />Signing in…</> : <>Enter AI Office <span aria-hidden="true">→</span></>}</button>
      </form>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="auth-divider"><span>or continue with</span></div>
      <div className="auth-providers" aria-label="OAuth providers"><button type="button" disabled title="Google OAuth will be available when production credentials are configured"><span className="provider-google">G</span>Google</button><button type="button" disabled title="GitHub OAuth will be available when production credentials are configured"><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.7A9.8 9.8 0 0 0 8.9 21.8c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1.1.1 1.6 1 1.6 1 .9 1.5 2.4 1.1 3 .8.1-.6.4-1.1.7-1.3-2.3-.3-4.7-1.1-4.7-5A3.9 3.9 0 0 1 6.8 9c-.1-.3-.4-1.2.1-2.6 0 0 .8-.3 2.7 1A9.2 9.2 0 0 1 12 7c.8 0 1.6.1 2.4.3 1.8-1.2 2.7-1 2.7-1 .5 1.4.2 2.3.1 2.6a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7.9.7 1.8v2.8c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.7Z" /></svg>GitHub</button></div>
      <p className="auth-provider-note">Single sign-on will appear here once your organization enables it.</p>
    </div></section>
  </main>;
}
