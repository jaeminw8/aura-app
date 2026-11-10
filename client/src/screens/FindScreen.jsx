import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import FindExplainer, { hasSeenExplainer, markExplainerSeen } from '../components/FindExplainer.jsx';
import GroupCard from '../components/GroupCard.jsx';
import GroupSwitcher from '../components/GroupSwitcher.jsx';
import Icon from '../components/Icon.jsx';
import { Loader } from '../components/Loading.jsx';
import SwipeCard from '../components/SwipeCard.jsx';
import { useToast } from '../components/ui.jsx';
import { plural } from '../format.js';
import MemberProfile from '../components/MemberProfile.jsx';
import { Sheet } from '../components/ui.jsx';

export default function FindScreen({ me, onSwitchGroup, refreshMe, isDesktop = false }) {
  const toast = useToast();
  const activeGroupId = me.activeGroupId;
  const [data, setData] = useState(null); // { actingGroup, total, recommendations }
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [memberProfile, setMemberProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [explainerOpen, setExplainerOpen] = useState(() => !hasSeenExplainer());
  const closeExplainer = () => {
    markExplainerSeen();
    setExplainerOpen(false);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api(`/recommendations?groupId=${activeGroupId}`));
      setIndex(0);
    } catch (err) {
      setError(err);
    }
  }, [activeGroupId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const current = data?.recommendations[index];
  const showMember = async (member) => {
    setProfileError(null);
    try {
      setMemberProfile((await api(`/groups/${current.id}/members/${member.id}/profile`)).profile);
    } catch (err) {
      setProfileError(err);
    }
  };

  const decide = async (decision) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const res = await api(`/groups/${activeGroupId}/likes`, {
        method: 'POST',
        body: { toGroupId: current.id, decision },
      });
      if (res.matched) {
        toast(`It's a match with ${current.name}! Your group chat is ready.`, {
          duration: 6000,
          action: { label: 'Open', onClick: () => { window.location.hash = `#/messages/${res.chat.id}`; } },
        });
        refreshMe();
      } else if (decision === 'connect') {
        toast(`Sent for ${data.actingGroup.name}! If ${current.name} connects back, you'll all get a group chat.`);
      }
      setIndex((i) => i + 1);
    } catch (err) {
      // Someone else in the group already decided on this one: just move on.
      if (['ALREADY_DECIDED', 'ALREADY_MATCHED'].includes(err.code)) setIndex((i) => i + 1);
      toast(err.message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const activeName = me.groups.find((g) => g.id === activeGroupId)?.name;

  return (
    <div className="screen screen--find">
      <header className="page-head">
        {isDesktop ? <h1 className="page-title">Find</h1> : <span className="wordmark" aria-label="aura">aura</span>}
        <GroupSwitcher groups={me.groups} activeGroupId={activeGroupId} onSwitch={onSwitchGroup} />
      </header>

      {error && (
        <div className="empty">
          <h2>Couldn't load groups</h2>
          <p>{error.message}</p>
          <button type="button" className="btn btn--primary" onClick={load}>Try again</button>
        </div>
      )}
      {!data && !error && <Loader label={`Finding groups for ${activeName}…`} />}

      {data && (
        <>
          <p className="match-sub">
            {plural(data.total, 'group')} near you {data.total === 1 ? 'matches' : 'match'} {data.actingGroup.name}
          </p>
          <div className="acting-note">
            <p>
              You're choosing for <strong>{data.actingGroup.name}</strong>. Connect means your group wants to meet
              theirs, not that you join it.
            </p>
            <button type="button" className="link-btn" onClick={() => setExplainerOpen(true)}>How it works</button>
          </div>
          {current ? (
            <>
              <SwipeCard key={current.id} onSwipe={decide} disabled={busy || explainerOpen}>
                <GroupCard group={current} position={index + 1} total={data.total} onMemberClick={showMember} />
              </SwipeCard>
              <div className="decide-bar">
                <button
                  type="button"
                  className="btn btn--outline btn--lg"
                  disabled={busy}
                  onClick={() => decide('pass')}
                  aria-label={`Pass on ${current.name}`}
                >
                  <Icon name="x" size={24} /> Pass
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  disabled={busy}
                  onClick={() => decide('connect')}
                  aria-label={`Connect with ${current.name}`}
                >
                  <Icon name="userPlus" size={24} /> Connect
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              <span className="empty__icon"><Icon name="users" size={30} /></span>
              <h2>You're all caught up</h2>
              <p>
                {data.total === 0
                  ? `No new groups to show ${data.actingGroup.name} right now.`
                  : `That's everyone near ${data.actingGroup.name} for now.`}{' '}
                Check back later, or see who's already said hi.
              </p>
              <a className="btn btn--primary" href="#/messages">Go to Messages</a>
            </div>
          )}
        </>
      )}

      {explainerOpen && (
        <FindExplainer
          groupName={data?.actingGroup.name ?? activeName ?? 'your group'}
          isDesktop={isDesktop}
          onClose={closeExplainer}
        />
      )}
      {memberProfile && (
        <Sheet title={`${memberProfile.firstName}'s profile`} onClose={() => setMemberProfile(null)}>
          <MemberProfile profile={memberProfile} />
        </Sheet>
      )}
      {profileError && (
        <div className="toast toast--error" role="alert">{profileError.message}</div>
      )}
    </div>
  );
}
