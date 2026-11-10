import { useState } from 'react';
import { api } from '../api.js';
import { authHref } from '../routes.js';
import { Field, FormError, useAsyncAction } from '../components/ui.jsx';
import { authErrorMessage, supabase } from '../supabase.js';

const MIN_PASSWORD = 8;

function AuthHero() {
  return (
    <div className="gate__hero">
      <span className="wordmark">aura</span>
      <p>Find other friend groups to hang out with.</p>
    </div>
  );
}

// New visitors land here. The names ride along as account metadata; once the session exists,
// App creates the users row from them (POST /api/users) and moves on to profile setup.
export function SignUp({ next }) {
  const [v, setV] = useState({ firstName: '', lastName: '', city: '', email: '', password: '' });
  const [checkEmail, setCheckEmail] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { data, error: authError } = await supabase.auth.signUp({
        email: v.email.trim(),
        password: v.password,
        options: { data: { firstName: v.firstName.trim(), lastName: v.lastName.trim(), city: v.city.trim() } },
      });
      if (authError) throw new Error(authErrorMessage(authError));
      // Only happens if "Confirm email" is turned on in Supabase.
      if (!data.session) setCheckEmail(true);
    });
  };

  return (
    <main className="gate">
      <AuthHero />
      <section className="card" aria-labelledby="signup-title">
        <h1 id="signup-title" className="card__title">Create your account</h1>
        {checkEmail ? (
          <p role="status">Check your email for a link to confirm your account, then sign in.</p>
        ) : (
          <form onSubmit={submit}>
            <FormError error={error} />
            <div className="field-row">
              <Field label="First name">
                <input value={v.firstName} onChange={set('firstName')} required maxLength={50} autoComplete="given-name" />
              </Field>
              <Field label="Last name">
                <input value={v.lastName} onChange={set('lastName')} required maxLength={50} autoComplete="family-name" />
              </Field>
            </div>
            <Field label="City">
              <input value={v.city} onChange={set('city')} required maxLength={80} placeholder="Provo, UT" autoComplete="address-level2" />
            </Field>
            <Field label="Email">
              <input type="email" value={v.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
            </Field>
            <Field label="Password">
              <input
                type="password" value={v.password} onChange={set('password')} required minLength={MIN_PASSWORD}
                autoComplete="new-password" aria-describedby="password-hint"
              />
            </Field>
            <p id="password-hint" className="muted-small field-hint">At least {MIN_PASSWORD} characters.</p>
            <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Creating account…' : 'Sign up'}</button>
            <button type="button" className="btn btn--outline btn--block auth-cancel" onClick={() => { window.location.hash = '#/signin'; }}>Cancel</button>
          </form>
        )}
      </section>
      <p className="auth-switch">Already have an account? <a href={authHref('signin', next)}>Sign in</a></p>
    </main>
  );
}

export function SignIn({ next }) {
  const [v, setV] = useState({ email: '', password: '' });
  const { busy, error, run } = useAsyncAction();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: v.email.trim(), password: v.password });
      if (authError) throw new Error(authErrorMessage(authError));
    });
  };

  return (
    <main className="gate">
      <AuthHero />
      <section className="card" aria-labelledby="signin-title">
        <h1 id="signin-title" className="card__title">Sign in</h1>
        <form onSubmit={submit}>
          <FormError error={error} />
          <Field label="Email">
            <input type="email" value={v.email} onChange={set('email')} required autoComplete="email" inputMode="email" />
          </Field>
          <Field label="Password">
            <input type="password" value={v.password} onChange={set('password')} required autoComplete="current-password" />
          </Field>
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
      <p className="auth-switch">New to aura? <a href={authHref('signup', next)}>Create an account</a></p>
    </main>
  );
}

// Signed in, but the account has no users row and no names to make one from
// (for example, sign up was interrupted). Ask for the basics once.
export function FinishAccount({ email, onDone, onSignOut }) {
  const [v, setV] = useState({ firstName: '', lastName: '', city: '' });
  const { busy, error, run } = useAsyncAction();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/users', { method: 'POST', body: v });
      await onDone();
    });
  };
  return (
    <main className="gate">
      <AuthHero />
      <section className="card" aria-labelledby="finish-title">
        <h1 id="finish-title" className="card__title">Finish creating your account</h1>
        <p className="muted-small">Signed in as {email}.</p>
        <form onSubmit={submit}>
          <FormError error={error} />
          <div className="field-row">
            <Field label="First name"><input value={v.firstName} onChange={set('firstName')} required maxLength={50} autoComplete="given-name" /></Field>
            <Field label="Last name"><input value={v.lastName} onChange={set('lastName')} required maxLength={50} autoComplete="family-name" /></Field>
          </div>
          <Field label="City"><input value={v.city} onChange={set('city')} required maxLength={80} placeholder="Provo, UT" /></Field>
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
          <button type="button" className="btn btn--outline btn--block auth-cancel" onClick={onSignOut}>Cancel</button>
        </form>
      </section>
      <p className="auth-switch"><button type="button" className="link-btn" onClick={onSignOut}>Log out</button></p>
    </main>
  );
}
