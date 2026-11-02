import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import GroupCard from '../components/GroupCard.jsx';
import GroupSwitcher from '../components/GroupSwitcher.jsx';
import Icon from '../components/Icon.jsx';
import { Loader } from '../components/Loading.jsx';
import { useToast } from '../components/ui.jsx';
import { plural } from '../format.js';

export default function FindScreen({ me, onSwitchGroup, refreshMe, isDesktop = false }) {
  const toast = useToast();
  const activeGroupId = me.activeGroupId;
  const [data, setData] = useState(null); // { actingGroup, total, recommendations }
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

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
        toast(`Sent! We'll let you know if ${current.name} connects back.`);
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
          {current ? (
            <>
              <GroupCard key={current.id} group={current} position={index + 1} total={data.total} />
              <div className="decide-bar">
                <button type="button" className="btn btn--outline btn--lg" disabled={busy} onClick={() => decide('pass')}>
                  <Icon name="x" size={24} /> Not now
                </button>
                <button type="button" className="btn btn--primary btn--lg" disabled={busy} onClick={() => decide('connect')}>
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
    </div>
  );
}
