import { useState } from 'react';
import { api } from '../api.js';
import Avatar, { AvatarStack } from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import {
  AddInterestForm, CreateOrJoinForm, EditProfileForm, InviteFriends, ManageGroupForm,
} from '../components/forms.jsx';
import { Sheet, useToast } from '../components/ui.jsx';
import { RELATIONSHIP_LABELS } from '../format.js';

const PHOTO_TINTS = ['#E6E1FF', '#DDF3E0', '#FDDCCB'];
const PHOTO_INK = ['#4C1D95', '#166534', '#9A3412'];
export default function ProfileScreen({ me, setMe, refreshMe, onSwitchGroup, onSignOut, isDesktop }) {
  const toast = useToast();
  const [sheet, setSheet] = useState(null); // { type, group? }
  const close = () => setSheet(null);
  const { user, photos, interests } = me;

  const saveInterests = async (names) => {
    const updated = await api('/me', { method: 'PATCH', body: { interests: names } });
    setMe(updated);
    return updated;
  };
  const addInterest = async (name) => {
    await saveInterests([...interests.map((i) => i.name), name]);
    close();
    toast(`Added ${name}. Your groups' shared interests are updated.`);
  };
  const removeInterest = async (interest) => {
    try {
      await saveInterests(interests.filter((i) => i.id !== interest.id).map((i) => i.name));
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const addPhoto = async () => {
    try {
      await api('/me/photos', { method: 'POST', body: {} });
      await refreshMe();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  const removePhoto = async (photo) => {
    try {
      await api(`/me/photos/${photo.id}`, { method: 'DELETE' });
      await refreshMe();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  const about = [
    ['Age', user.age],
    ['Gender', user.gender],
    ['Relationship', RELATIONSHIP_LABELS[user.relationshipStatus]],
    ['Personality', user.personalityTraits.join(' · ')],
  ];

  return (
    <div className="screen screen--profile">
      <header className="page-head">
        <h1 className="page-title">Profile</h1>
        <button type="button" className="icon-btn" aria-label="Edit profile settings" onClick={() => setSheet({ type: 'edit' })}>
          <Icon name="sliders" />
        </button>
      </header>

      <div className="profile-columns">
        <div className="profile-col">
          <section className="card">
            <div className="profile-top">
              <Avatar initials={user.initials} color={user.avatarColor} size={72} />
              <div className="profile-top__info">
                <h2 className="profile-top__name">{user.firstName} {user.lastName}</h2>
                <div className="subtle">{user.city}</div>
              </div>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setSheet({ type: 'edit' })}>Edit</button>
            </div>
            {user.bio && <p className="profile-bio">{user.bio}</p>}
          </section>

          <section className="card">
            <div className="card__head">
              <h2 className="card__title">Photos</h2>
              <span className="muted-small">{photos.length} of 3</span>
            </div>
            <div className="photos">
              {photos.map((p, i) => (
                <div key={p.id} className="photo" style={{ background: PHOTO_TINTS[i % 3], color: PHOTO_INK[i % 3] }}>
                  [{p.label}]
                  {photos.length > 1 && (
                    <button type="button" className="photo__remove" aria-label={`Remove ${p.label}`} onClick={() => removePhoto(p)}>
                      <Icon name="x" size={16} />
                    </button>
                  )}
                </div>
              ))}
              {photos.length < 3 && (
                <button type="button" className="photo photo--add" onClick={addPhoto}>
                  <Icon name="plus" size={28} />
                  Add photo
                </button>
              )}
            </div>
          </section>

          <section className="card">
            <h2 className="card__title">About me</h2>
            <dl className="about">
              {about.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card">
            <h2 className="card__title">Interests</h2>
            <div className="chips">
              {interests.map((i) => (
                <span key={i.id} className="chip">
                  {i.name}
                  {interests.length > 1 && (
                    <button type="button" className="chip__remove" aria-label={`Remove ${i.name}`} onClick={() => removeInterest(i)}>
                      <Icon name="x" size={14} strokeWidth={2.5} />
                    </button>
                  )}
                </span>
              ))}
              <button type="button" className="chip chip--dashed" onClick={() => setSheet({ type: 'interest' })}>+ Add</button>
            </div>
            <p className="hint">Changes here update your groups' shared interests.</p>
          </section>

        </div>

        <div className="profile-col">
          <div className="mygroups-head">
            <h2>My groups</h2>
            <button type="button" className="btn btn--dark btn--sm" onClick={() => setSheet({ type: 'createJoin' })}>Create or join</button>
          </div>

          {me.groups.map((g) => (
            <MyGroupCard
              key={g.id}
              group={g}
              onSwitch={() => onSwitchGroup(g.id)}
              onInvite={() => setSheet({ type: 'invite', group: g })}
              onManage={() => setSheet({ type: 'manage', group: g })}
            />
          ))}

          {/* Desktop has Sign out in the sidebar. */}
          {!isDesktop && (
            <button type="button" className="btn btn--outline btn--block profile-signout" onClick={onSignOut}>Sign out</button>
          )}
        </div>
      </div>

      {sheet?.type === 'edit' && (
        <Sheet title="Edit profile" onClose={close}>
          <EditProfileForm me={me} onSaved={(updated) => { setMe(updated); close(); toast('Profile saved.'); }} />
        </Sheet>
      )}
      {sheet?.type === 'interest' && (
        <Sheet title="Add an interest" onClose={close}>
          <AddInterestForm current={interests} onAdd={addInterest} />
        </Sheet>
      )}
      {sheet?.type === 'createJoin' && (
        <Sheet title="Create or join" onClose={close}>
          <CreateOrJoinForm
            onDone={async (group, tab) => {
              await refreshMe();
              close();
              toast(tab === 'create' ? `Created ${group.name}. It's now your active group.` : `You joined ${group.name}.`);
            }}
          />
        </Sheet>
      )}
      {sheet?.type === 'invite' && (
        <Sheet title={`Invite to ${sheet.group.name}`} onClose={close}>
          <InviteFriends group={sheet.group} onChanged={refreshMe} />
        </Sheet>
      )}
      {sheet?.type === 'manage' && (
        <Sheet title="Manage group" onClose={close}>
          <ManageGroupForm
            group={sheet.group}
            onSaved={async () => { await refreshMe(); close(); toast('Group updated.'); }}
            onLeft={async () => { close(); await refreshMe(); toast(`You left ${sheet.group.name}.`); }}
          />
        </Sheet>
      )}
    </div>
  );
}

function MyGroupCard({ group, onSwitch, onInvite, onManage }) {
  const topInterests = group.interests.slice(0, 3).map((i) => i.name).join(', ');
  return (
    <section className={`card mygroup ${group.isActive ? 'mygroup--active' : ''}`} aria-label={group.name}>
      <div className="mygroup__head">
        <Avatar initials={group.initials} color={group.avatarColor} size={60} shape="square" solid={group.isActive} />
        <div>
          <div className="mygroup__name">
            {group.name} {group.isActive && <span className="badge">Active</span>}
          </div>
          <div className="mygroup__meta">
            {group.memberCount} of 10 members · {group.isFull ? 'Group is full' : topInterests || 'No interests yet'}
          </div>
        </div>
        {!group.isActive && <button type="button" className="btn btn--outline btn--sm" onClick={onSwitch}>Switch</button>}
      </div>

      <div className="mygroup__people">
        <AvatarStack people={group.members} max={7} />
        {!group.isFull && <button type="button" className="link-btn" onClick={onInvite}>+ Invite friends</button>}
      </div>

      <button type="button" className="btn btn--outline btn--block" onClick={onManage}>Manage group</button>
    </section>
  );
}
