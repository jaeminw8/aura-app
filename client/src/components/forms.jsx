import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { GENDERS, RELATIONSHIP_LABELS, TRAIT_SUGGESTIONS } from '../format.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { Loader } from './Loading.jsx';
import { Field, FormError, useAsyncAction } from './ui.jsx';

// Profile fields (no photos/interests): used by Edit profile and onboarding.
export function ProfileFields({ value, onChange }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const toggleTrait = (trait) => {
    const has = value.personalityTraits.includes(trait);
    if (!has && value.personalityTraits.length >= 5) return;
    onChange({
      ...value,
      personalityTraits: has ? value.personalityTraits.filter((t) => t !== trait) : [...value.personalityTraits, trait],
    });
  };
  return (
    <>
      <div className="field-row">
        <Field label="First name"><input value={value.firstName} onChange={set('firstName')} maxLength={50} required /></Field>
        <Field label="Last name"><input value={value.lastName} onChange={set('lastName')} maxLength={50} required /></Field>
      </div>
      <Field label="City"><input value={value.city} onChange={set('city')} maxLength={80} required /></Field>
      <Field label="Bio">
        <textarea value={value.bio} onChange={set('bio')} maxLength={500} placeholder="What's your crew like? What are you into?" />
      </Field>
      <div className="field-row">
        <Field label="Age"><input type="number" inputMode="numeric" min={18} max={120} value={value.age} onChange={set('age')} /></Field>
        <Field label="Gender">
          <select value={value.gender} onChange={set('gender')}>
            <option value="">Choose…</option>
            {[...new Set([...GENDERS, value.gender].filter(Boolean))].map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Relationship status">
        <select value={value.relationshipStatus} onChange={set('relationshipStatus')}>
          <option value="">Choose…</option>
          {Object.entries(RELATIONSHIP_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </Field>
      <div className="field">
        <span className="field__label">Personality (up to 5)</span>
        <div className="chips">
          {[...new Set([...TRAIT_SUGGESTIONS, ...value.personalityTraits])].map((t) => (
            <button key={t} type="button" className="chip chip--toggle" aria-pressed={value.personalityTraits.includes(t)} onClick={() => toggleTrait(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export const profileFormValue = (user) => ({
  firstName: user.firstName ?? '',
  lastName: user.lastName ?? '',
  city: user.city ?? '',
  bio: user.bio ?? '',
  age: user.age ?? '',
  gender: user.gender ?? '',
  relationshipStatus: user.relationshipStatus ?? '',
  personalityTraits: user.personalityTraits ?? [],
});

export const profilePatch = (v) => ({
  firstName: v.firstName,
  lastName: v.lastName,
  city: v.city,
  bio: v.bio,
  age: v.age === '' ? null : Number(v.age),
  gender: v.gender || null,
  relationshipStatus: v.relationshipStatus || null,
  personalityTraits: v.personalityTraits,
});

export function EditProfileForm({ me, onSaved }) {
  const [value, setValue] = useState(() => profileFormValue(me.user));
  const { busy, error, run } = useAsyncAction();
  const submit = (e) => {
    e.preventDefault();
    run(async () => onSaved(await api('/me', { method: 'PATCH', body: profilePatch(value) })));
  };
  return (
    <form onSubmit={submit}>
      <FormError error={error} />
      <ProfileFields value={value} onChange={setValue} />
      <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>
  );
}

// "+ Add" interest: type a new one or pick from existing interests.
export function AddInterestForm({ current, onAdd }) {
  const [all, setAll] = useState([]);
  const [text, setText] = useState('');
  const { busy, error, run } = useAsyncAction();
  useEffect(() => {
    api('/interests').then((d) => setAll(d.interests)).catch(() => {});
  }, []);
  const have = new Set(current.map((i) => i.name.toLowerCase()));
  const q = text.trim().toLowerCase();
  const suggestions = all.filter((i) => !have.has(i.name.toLowerCase()) && (!q || i.name.toLowerCase().includes(q)));
  const add = (name) => run(() => onAdd(name));
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (q) add(text.trim()); }}>
      <FormError error={error} />
      <Field label="Interest">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Pickleball" maxLength={40} />
      </Field>
      <div className="chips" style={{ marginBottom: 16 }}>
        {suggestions.slice(0, 14).map((i) => (
          <button key={i.id} type="button" className="chip chip--gray" disabled={busy} onClick={() => add(i.name)}>
            + {i.name}
          </button>
        ))}
      </div>
      <button className="btn btn--primary btn--block" disabled={busy || !q}>
        {busy ? 'Adding…' : q ? `Add "${text.trim()}"` : 'Type or pick an interest'}
      </button>
    </form>
  );
}

// Create a new group or join one with an invite code.
export function CreateOrJoinForm({ onDone, defaultTab = 'create' }) {
  const [tab, setTab] = useState(defaultTab);
  const [name, setName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, setError, run } = useAsyncAction();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const res = tab === 'create'
        ? await api('/groups', { method: 'POST', body: { name, statusText } })
        : await api('/groups/join', { method: 'POST', body: { inviteCode: code } });
      await onDone(res.group, tab);
    });
  };
  return (
    <form onSubmit={submit}>
      <div className="tabs" role="tablist">
        {['create', 'join'].map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setError(null); }}>
            {t === 'create' ? 'Create a group' : 'Join with code'}
          </button>
        ))}
      </div>
      <FormError error={error} />
      {tab === 'create' ? (
        <>
          <Field label="Group name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="e.g. Tuesday Crew" /></Field>
          <Field label="Status (optional)"><input value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={80} placeholder="e.g. Looking for people this weekend" /></Field>
        </>
      ) : (
        <Field label="Invite code">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} required placeholder="e.g. SUMMIT77" autoCapitalize="characters" />
        </Field>
      )}
      <button className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'One sec…' : tab === 'create' ? 'Create group' : 'Join group'}
      </button>
    </form>
  );
}

function defaultEventTime() {
  const d = new Date(Date.now() + 2 * 86400000);
  d.setHours(19, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AddEventForm({ group, onDone }) {
  const [v, setV] = useState({ title: '', placeName: '', startsAt: defaultEventTime(), cost: '' });
  const { busy, error, run } = useAsyncAction();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api(`/groups/${group.id}/events`, {
        method: 'POST',
        body: {
          title: v.title,
          placeName: v.placeName,
          startsAt: new Date(v.startsAt).toISOString(),
          costCents: Math.round((Number(v.cost) || 0) * 100),
        },
      });
      await onDone();
    });
  };
  return (
    <form onSubmit={submit}>
      <FormError error={error} />
      <Field label="What"><input value={v.title} onChange={set('title')} maxLength={100} required placeholder="Board game night" /></Field>
      <Field label="Where"><input value={v.placeName} onChange={set('placeName')} maxLength={100} required placeholder="Theo's place" /></Field>
      <div className="field-row field-row--wide-first">
        <Field label="When"><input type="datetime-local" value={v.startsAt} onChange={set('startsAt')} required /></Field>
        <Field label="Cost ($)"><input type="number" inputMode="decimal" min={0} step="0.01" value={v.cost} onChange={set('cost')} placeholder="Free" /></Field>
      </div>
      <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Adding…' : `Add to ${group.name}`}</button>
    </form>
  );
}

export function InviteFriends({ group, onChanged }) {
  const [friends, setFriends] = useState(null);
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAsyncAction();
  useEffect(() => {
    api('/me/friends').then((d) => setFriends(d.friends)).catch(() => setFriends([]));
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(group.inviteCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const add = (friend) => run(async () => {
    const res = await api(`/groups/${group.id}/members`, { method: 'POST', body: { userId: friend.id } });
    setFriends((fs) => fs.map((f) => (f.id === friend.id ? { ...f, groupIds: [...f.groupIds, group.id] } : f)));
    await onChanged(res.group);
  });
  return (
    <div>
      <p className="subtle" style={{ marginTop: 0 }}>Share this code. Friends enter it under Create or join.</p>
      <div className="invite-code">
        <span className="invite-code__value">{group.inviteCode}</span>
        <button type="button" className="btn btn--sm btn--outline" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={18} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <h3 className="section-label">Or add a friend directly · {group.memberCount} of 10</h3>
      <FormError error={error} />
      {friends === null && <Loader label="Loading friends…" compact />}
      {friends?.length === 0 && <p className="muted-small">No friends yet.</p>}
      {friends?.map((f) => {
        const inGroup = f.groupIds.includes(group.id);
        return (
          <div key={f.id} className="person-row">
            <Avatar initials={f.initials} color={f.avatarColor} size={40} />
            <span className="person-row__name">{f.firstName} {f.lastName}</span>
            {inGroup ? (
              <span className="muted-small">In group</span>
            ) : (
              <button type="button" className="btn btn--sm btn--soft" disabled={busy} onClick={() => add(f)}>Add</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ManageGroupForm({ group, onSaved, onLeft }) {
  const [name, setName] = useState(group.name);
  const [statusText, setStatusText] = useState(group.statusText ?? '');
  const { busy, error, run } = useAsyncAction();
  const save = (e) => {
    e.preventDefault();
    run(async () => onSaved((await api(`/groups/${group.id}`, { method: 'PATCH', body: { name, statusText } })).group));
  };
  const leave = () => {
    if (!window.confirm(`Leave ${group.name}?`)) return;
    run(async () => {
      await api(`/groups/${group.id}/members/me`, { method: 'DELETE' });
      await onLeft();
    });
  };
  return (
    <form onSubmit={save}>
      <FormError error={error} />
      <Field label="Group name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></Field>
      <Field label="Status"><input value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={80} placeholder="Looking for people this weekend" /></Field>
      <h3 className="section-label">Members · {group.memberCount} of 10</h3>
      {group.members.map((m) => (
        <div key={m.id} className="person-row">
          <Avatar initials={m.initials} color={m.avatarColor} size={40} />
          <span className="person-row__name">{m.firstName} {m.lastName}</span>
          {m.role === 'owner' && <span className="badge">Owner</span>}
        </div>
      ))}
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <button className="btn btn--primary btn--block" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="btn btn--danger btn--block" disabled={busy} onClick={leave}>Leave group</button>
      </div>
    </form>
  );
}
