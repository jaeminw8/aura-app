import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { AddInterestForm, CreateOrJoinForm, ProfileFields, profileFormValue, profilePatch } from '../components/forms.jsx';
import { Loader } from '../components/Loading.jsx';
import { Field, FormError, useAsyncAction } from '../components/ui.jsx';

// Step 0: no one is "signed in" yet. Pick a seeded user or sign up.
export function Welcome({ onSignedIn }) {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', city: '' });
  const { busy, error, run } = useAsyncAction();
  useEffect(() => {
    api('/users').then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const signUp = (e) => {
    e.preventDefault();
    run(async () => onSignedIn((await api('/users', { method: 'POST', body: form })).user.id));
  };
  return (
    <div className="gate">
      <div className="gate__hero">
        <span className="wordmark">aura</span>
        <p>Find other friend groups to hang out with.</p>
      </div>
      <section className="card">
        <h2 className="card__title">Signed in as…</h2>
        <p className="muted-small" style={{ marginTop: -6 }}>Prototype: pick a sample user (no password).</p>
        {users === null && <Loader label="Loading users…" compact />}
        {users?.map((u) => (
          <button key={u.id} type="button" className="user-pick" onClick={() => onSignedIn(u.id)}>
            <Avatar initials={u.initials} color={u.avatarColor} size={40} />
            <span>
              <span className="user-pick__name">{u.firstName} {u.lastName}</span><br />
              <span className="user-pick__group">{u.activeGroupName ?? 'No group yet'}</span>
            </span>
          </button>
        ))}
      </section>
      <section className="card">
        <h2 className="card__title">New here? Sign up</h2>
        <form onSubmit={signUp}>
          <FormError error={error} />
          <div className="field-row">
            <Field label="First name"><input value={form.firstName} onChange={set('firstName')} required maxLength={50} /></Field>
            <Field label="Last name"><input value={form.lastName} onChange={set('lastName')} required maxLength={50} /></Field>
          </div>
          <Field label="City"><input value={form.city} onChange={set('city')} required maxLength={80} placeholder="Provo, UT" /></Field>
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
      </section>
    </div>
  );
}

const MISSING_LABELS = {
  bio: 'a bio', photos: 'at least 1 photo', interests: 'at least 1 interest', age: 'your age',
  gender: 'gender', relationshipStatus: 'relationship status', personalityTraits: 'a personality trait',
};

// Step 1: build the profile (rule 1).
export function ProfileSetup({ me, setMe, refreshMe }) {
  const [value, setValue] = useState(() => profileFormValue(me.user));
  const { busy, error, run } = useAsyncAction();
  const missing = me.onboarding.missing;

  const addPhoto = () => run(async () => {
    await api('/me/photos', { method: 'POST', body: {} });
    await refreshMe();
  });
  const addInterest = async (name) => {
    setMe(await api('/me', { method: 'PATCH', body: { interests: [...me.interests.map((i) => i.name), name] } }));
  };
  const save = (e) => {
    e.preventDefault();
    run(async () => setMe(await api('/me', { method: 'PATCH', body: profilePatch(value) })));
  };

  return (
    <div className="gate">
      <div className="steps" aria-label="Step 1 of 2"><span className="on" /><span /></div>
      <h1 className="page-title" style={{ fontSize: 34 }}>Build your profile</h1>
      <p className="subtle">Other groups see this when they look at your group.</p>
      {missing.length > 0 && (
        <div className="gate-error" role="status">
          <Icon name="profile" />
          <span>Still needed: {missing.map((m) => MISSING_LABELS[m]).join(', ')}.</span>
        </div>
      )}

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">Photos</h2>
          <span className="muted-small">{me.photos.length} of 3</span>
        </div>
        <div className="photos">
          {me.photos.map((p) => <div key={p.id} className="photo" style={{ background: '#E6E1FF', color: '#4C1D95' }}>[{p.label}]</div>)}
          {me.photos.length < 3 && (
            <button type="button" className="photo photo--add" onClick={addPhoto} disabled={busy}>
              <Icon name="image" size={26} /> Add photo
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">Interests</h2>
        {me.interests.length > 0 && (
          <div className="chips" style={{ marginBottom: 14 }}>
            {me.interests.map((i) => <span key={i.id} className="chip">{i.name}</span>)}
          </div>
        )}
        <AddInterestForm current={me.interests} onAdd={addInterest} />
      </section>

      <section className="card">
        <h2 className="card__title">About you</h2>
        <form onSubmit={save}>
          <FormError error={error} />
          <ProfileFields value={value} onChange={setValue} />
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}</button>
        </form>
      </section>
    </div>
  );
}

// Step 2: rule 1 again. No group = no app, with an invitation to create or join one.
export function NoGroupGate({ refreshMe }) {
  return (
    <div className="gate">
      <div className="steps" aria-label="Step 2 of 2"><span className="on" /><span className="on" /></div>
      <h1 className="page-title" style={{ fontSize: 34 }}>One more thing</h1>
      <div className="gate-error" role="alert" style={{ marginTop: 16 }}>
        <Icon name="users" />
        <span>You need to be in a friend group before you can use aura. Create one for your crew, or join one with an invite code from a friend.</span>
      </div>
      <section className="card">
        <CreateOrJoinForm onDone={() => refreshMe()} />
      </section>
    </div>
  );
}
