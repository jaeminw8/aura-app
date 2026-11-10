import { useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { AddInterestForm, CreateOrJoinForm, InviteFriends, ProfileFields, profileFormValue, profilePatch } from '../components/forms.jsx';
import { FormError, useAsyncAction } from '../components/ui.jsx';

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
      <p className="subtle">This profile is about you. Groups come next, so people can meet the real person behind the group.</p>
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
        <p className="hint">Add at least one photo so other groups know who they may meet.</p>
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
        <p className="hint">These interests roll up into your group’s shared interests.</p>
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
export function NoGroupGate({ refreshMe, inviteCode = '' }) {
  const [createdGroup, setCreatedGroup] = useState(null);
  if (createdGroup) {
    return (
      <div className="gate">
        <div className="steps" aria-label="Step 2 of 2"><span className="on" /><span className="on" /></div>
        <h1 className="page-title" style={{ fontSize: 34 }}>Invite your friends</h1>
        <p className="subtle">Your group is ready. Share the code or link before you start finding other groups.</p>
        <section className="card">
          <InviteFriends group={createdGroup} onChanged={setCreatedGroup} />
          <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 18 }} onClick={refreshMe}>Continue to aura</button>
        </section>
      </div>
    );
  }
  const onDone = async (group, tab) => {
    await refreshMe();
    if (tab === 'join') window.location.hash = '#/find';
    else setCreatedGroup(group);
  };
  return (
    <div className="gate">
      <div className="steps" aria-label="Step 2 of 2"><span className="on" /><span className="on" /></div>
      <h1 className="page-title" style={{ fontSize: 34 }}>{inviteCode ? 'Join your friend group' : 'One more thing'}</h1>
      <div className="gate-error" role="alert" style={{ marginTop: 16 }}>
        <Icon name="users" />
        <span>You need to be in a friend group before you can use aura. Create one for your crew, or join one with an invite code from a friend.</span>
      </div>
      <section className="card">
        <CreateOrJoinForm defaultTab={inviteCode ? 'join' : 'create'} defaultInviteCode={inviteCode} joinOnly={Boolean(inviteCode)} onDone={onDone} />
      </section>
    </div>
  );
}

export function JoinGroupScreen({ refreshMe, inviteCode }) {
  const joinDone = async () => {
    await refreshMe();
    window.location.hash = '#/find';
  };
  return (
    <div className="gate">
      <h1 className="page-title" style={{ fontSize: 34 }}>Join your friend group</h1>
      <p className="subtle">Use the invite link your friend shared, then you’ll be ready to find groups together.</p>
      <section className="card"><CreateOrJoinForm defaultTab="join" defaultInviteCode={inviteCode} joinOnly onDone={joinDone} /></section>
    </div>
  );
}
