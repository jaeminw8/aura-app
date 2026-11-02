import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Avatar, { GroupPair, GroupPairSkeleton } from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { LoadingStatus, Skeleton, Spinner } from '../components/Loading.jsx';
import { useToast } from '../components/ui.jsx';
import ChatScreen from './ChatScreen.jsx';
import { formatChatTime, plural } from '../format.js';
import { usePoll } from '../usePoll.js';

const VIEW_TITLES = { archived: 'Archived', deleted: 'Recently deleted' };
const POLL_MS = 5000;
// Name and preview widths of the chat list's placeholder rows.
const CHAT_PLACEHOLDERS = [['60%', '85%'], ['45%', '70%'], ['68%', '78%']];
// How many requests each group had when Messages last loaded, so the likes box's placeholder
// has that many rows (and stays hidden at 0). Until the first load it shows one.
const likeCounts = new Map();
const likesTitle = (count, groupName) => `${plural(count, 'group')} ${count === 1 ? 'wants' : 'want'} to meet ${groupName}`;

export default function MessagesScreen({ me, onSwitchGroup, refreshMe, isDesktop = false, chatId = null }) {
  const toast = useToast();
  const groupId = me.activeGroupId;
  const activeGroup = me.groups.find((g) => g.id === groupId);
  const [view, setView] = useState('inbox');
  const [likes, setLikes] = useState(null);
  const [chats, setChats] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // { id, action } while a request is being answered
  const [selected, setSelected] = useState(() => new Set());
  const [newChatId, setNewChatId] = useState(null);
  const listVersion = useRef(0); // bumped by changes made here, so an in-flight refresh can't undo them

  const load = useCallback(async () => {
    listVersion.current += 1;
    setError(null);
    try {
      const [likeData, chatData] = await Promise.all([
        api(`/groups/${groupId}/incoming-likes`),
        api(`/groups/${groupId}/chats?view=${view}`),
      ]);
      setLikes(likeData.likes);
      setChats(chatData.chats);
    } catch (err) {
      setError(err);
    }
  }, [groupId, view]);

  useEffect(() => {
    setChats(null);
    setSelected(new Set());
    load();
  }, [load]);

  useEffect(() => {
    if (likes) likeCounts.set(groupId, likes.length);
  }, [likes, groupId]);

  // Polled (and called by the desktop chat pane after reads/sends) so new messages re-sort the
  // list and update previews and unread counts. The server already sorts by newest activity.
  const refreshChats = useCallback(async () => {
    const version = listVersion.current;
    try {
      const { chats: next } = await api(`/groups/${groupId}/chats?view=${view}`);
      if (version !== listVersion.current) return;
      setChats((cs) => (JSON.stringify(cs) === JSON.stringify(next) ? cs : next));
    } catch {
      // The list keeps its last good state; the next poll will retry.
    }
  }, [groupId, view]);
  usePoll(refreshChats, POLL_MS, chats !== null && !error);

  // The tab bar / sidebar badge sums this same inbox (from /me), so re-check it when they disagree.
  // Desktop: wait while the open chat still counts as unread; the pane marks it read on its next
  // poll, and the refresh that follows re-runs this check.
  useEffect(() => {
    if (view !== 'inbox' || !chats) return;
    if (isDesktop && chats.some((c) => c.id === chatId && c.unreadCount > 0)) return;
    const unread = chats.reduce((sum, c) => sum + c.unreadCount, 0);
    if (unread !== me.unreadMessages) refreshMe();
  }, [chats, view, me.unreadMessages, refreshMe, isDesktop, chatId]);

  // The vertical slice: accept -> server creates match + chat -> we update the lists in place.
  const accept = async (like) => {
    setPending({ id: like.id, action: 'accept' });
    try {
      const { chat } = await api(`/likes/${like.id}/accept`, { method: 'POST' });
      setLikes((ls) => ls.filter((l) => l.id !== like.id));
      listVersion.current += 1;
      if (view === 'inbox') setChats((cs) => [chat, ...(cs ?? []).filter((c) => c.id !== chat.id)]);
      setNewChatId(chat.id);
      if (isDesktop) window.location.hash = `#/messages/${chat.id}`; // open it in the chat pane
      toast(`You matched with ${like.group.name}! Say hi in your new chat.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
      if (['ALREADY_MATCHED', 'ALREADY_DECIDED', 'LIKE_NOT_FOUND'].includes(err.code)) load();
    } finally {
      setPending(null);
    }
  };

  const decline = async (like) => {
    setPending({ id: like.id, action: 'decline' });
    try {
      await api(`/likes/${like.id}/decline`, { method: 'POST' });
      setLikes((ls) => ls.filter((l) => l.id !== like.id));
      toast(`Declined ${like.group.name}.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setPending(null);
    }
  };

  const loading = !chats && !error;
  const likePlaceholders = likeCounts.get(groupId) ?? 1;
  const selecting = selected.size > 0;
  const allSelected = chats?.length > 0 && selected.size === chats.length;
  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const bulk = async (action, verb) => {
    const ids = [...selected];
    try {
      await api('/chats/bulk', { method: 'POST', body: { action, chatIds: ids } });
      listVersion.current += 1;
      setChats((cs) => cs.filter((c) => !selected.has(c.id)));
      setSelected(new Set());
      toast(`${plural(ids.length, 'chat')} ${verb}.`);
      refreshMe();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  const listPane = (
    <div className={isDesktop ? 'messages__list' : 'screen'}>
      <header className="page-head">
        <h1 className="page-title">Messages</h1>
      </header>

      {me.groups.length > 0 && (
        <div className="chatting-as">
          <span className="chatting-as__label">Chatting as</span>
          <div className="chatting-as__groups">
            {[...me.groups].sort((a, b) => a.id - b.id).map((g) => (
              <button
                key={g.id}
                type="button"
                className="as-pill"
                aria-pressed={g.id === groupId}
                onClick={() => g.id !== groupId && onSwitchGroup(g.id)}
              >
                <Avatar initials={g.initials} color={g.id === groupId ? '#FFFFFF' : g.avatarColor} size={42} />
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="empty">
          <h2>Couldn't load messages</h2>
          <p>{error.message}</p>
          <button type="button" className="btn btn--primary" onClick={load}>Try again</button>
        </div>
      )}

      {view === 'inbox' && !likes && !error && likePlaceholders > 0 && (
        <LikesSkeleton rows={likePlaceholders} title={likesTitle(likePlaceholders, activeGroup?.name)} />
      )}
      {view === 'inbox' && likes?.length > 0 && (
        <section className="likes-box" aria-label="Groups that liked you">
          <h2 className="likes-box__title">{likesTitle(likes.length, activeGroup?.name)}</h2>
          {likes.map((like) => {
            const g = like.group;
            const extra = g.stats?.mutualFriends
              ? plural(g.stats.mutualFriends, 'mutual friend')
              : plural(g.stats?.sharedInterestCount ?? 0, 'shared interest');
            const busy = pending?.id === like.id;
            const accepting = busy && pending.action === 'accept';
            return (
              <div key={like.id} className="like-row" style={{ opacity: busy ? 0.6 : 1 }} aria-busy={busy || undefined}>
                <Avatar initials={g.initials} color={g.avatarColor} size={48} shape="square" />
                <div className="like-row__info">
                  <div className="like-row__name">{g.name}</div>
                  <div className="like-row__meta">{plural(g.memberCount, 'member')} · {extra}</div>
                </div>
                <div className="like-row__actions">
                  <button type="button" className="icon-btn icon-btn--square" aria-label={`Decline ${g.name}`} disabled={busy} onClick={() => decline(like)}>
                    {busy && !accepting ? <Spinner size={20} /> : <Icon name="x" />}
                  </button>
                  <button
                    type="button"
                    className={`btn btn--primary btn--sm ${accepting ? 'btn--busy' : ''}`}
                    aria-label={`Accept ${g.name}`}
                    disabled={busy}
                    onClick={() => accept(like)}
                  >
                    <span className="btn__label">Accept</span>
                    {accepting && <Spinner size={18} />}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {view !== 'inbox' && (
        <div className="view-banner">
          <button type="button" className="link-btn" onClick={() => setView('inbox')}>
            <Icon name="chevronLeft" size={18} /> Chats
          </button>
          <strong>{VIEW_TITLES[view]}</strong>
        </div>
      )}

      <div className="chats-head">
        <h2 className="section-label">{view === 'inbox' ? 'Chats' : VIEW_TITLES[view]}</h2>
        {chats?.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setSelected(allSelected ? new Set() : new Set(chats.map((c) => c.id)))}>
            {allSelected ? 'Clear' : 'Select all'}
          </button>
        )}
        {view === 'inbox' && (
          <>
            <button
              type="button"
              className="icon-btn icon-btn--plain"
              aria-label={selecting ? 'Archive selected chats' : 'Show archived chats'}
              title={selecting ? 'Archive selected' : 'Archived chats'}
              onClick={() => (selecting ? bulk('archive', 'archived') : setView('archived'))}
            >
              <Icon name="archive" />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--plain"
              aria-label={selecting ? 'Delete selected chats' : 'Show recently deleted chats'}
              title={selecting ? 'Delete selected' : 'Recently deleted'}
              onClick={() => (selecting ? bulk('delete', 'moved to Recently deleted') : setView('deleted'))}
            >
              <Icon name="trash" />
            </button>
          </>
        )}
        {view === 'archived' && selecting && (
          <button type="button" className="btn btn--sm btn--soft" onClick={() => bulk('unarchive', 'moved back to Chats')}>Unarchive</button>
        )}
        {view === 'deleted' && selecting && (
          <button type="button" className="btn btn--sm btn--soft" onClick={() => bulk('restore', 'restored')}>
            <Icon name="restore" size={18} /> Restore
          </button>
        )}
      </div>

      {loading && (
        <>
          <ChatListSkeleton />
          <LoadingStatus label={view === 'inbox' ? 'Loading chats…' : `Loading ${VIEW_TITLES[view].toLowerCase()} chats…`} />
        </>
      )}
      {chats?.length === 0 && (
        <div className="empty">
          <span className="empty__icon"><Icon name="messages" size={30} /></span>
          <h2>{view === 'inbox' ? 'No chats yet' : `Nothing ${view === 'archived' ? 'archived' : 'deleted'}`}</h2>
          <p>{view === 'inbox' ? 'When two groups connect, a shared group chat shows up here.' : 'Chats you move here will show up in this list.'}</p>
          {view === 'inbox' && <a className="btn btn--primary" href="#/find">Find groups</a>}
        </div>
      )}
      {chats?.length > 0 && (
        <div className="chat-list">
          {chats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              isNew={chat.id === newChatId}
              isOpen={isDesktop && chat.id === chatId}
              selecting={selecting}
              selected={selected.has(chat.id)}
              onToggle={() => toggle(chat.id)}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (!isDesktop) return listPane;
  return (
    <div className="messages-split">
      {listPane}
      <section className="messages__pane" aria-label="Conversation">
        {chatId ? (
          <ChatScreen key={chatId} chatId={chatId} refreshMe={refreshMe} onActivity={refreshChats} embedded />
        ) : (
          <div className="pane-empty">
            <span className="empty__icon"><Icon name="messages" size={30} /></span>
            <h2>Pick a chat</h2>
            <p>Choose a conversation on the left, or accept a group that wants to meet {activeGroup?.name}.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ChatRow({ chat, isNew, isOpen, selecting, selected, onToggle }) {
  const last = chat.lastMessage;
  const preview = last
    ? `${last.mine ? 'You' : last.senderFirstName ?? 'Someone'}: ${last.body}`
    : 'New match! Say hi to the group.';
  const open = () => {
    if (selecting) onToggle();
    else window.location.hash = `#/messages/${chat.id}`;
  };
  return (
    <button
      type="button"
      className={`chat-row ${isNew ? 'chat-row--new' : ''} ${isOpen ? 'chat-row--open' : ''}`}
      onClick={open}
      aria-pressed={selecting ? selected : undefined}
      aria-current={isOpen ? 'true' : undefined}
      data-chat-id={chat.id}
    >
      {selecting && (
        <span className={`check ${selected ? 'check--on' : ''}`} aria-hidden="true">
          {selected && <Icon name="check" size={16} strokeWidth={3} />}
        </span>
      )}
      <GroupPair mine={chat.myGroup} other={chat.otherGroup} size={46} />
      <span className="chat-row__main">
        <span className="chat-row__top">
          <span className="chat-row__name">{chat.name}</span>
          <span className="chat-row__time">{formatChatTime(chat.lastActivityAt)}</span>
        </span>
        <span className="chat-row__mid">
          <span className={`chat-row__last ${last ? '' : 'chat-row__last--new'}`}>{preview}</span>
          {chat.unreadCount > 0 && !isOpen && <span className="count-dot" aria-label={`${chat.unreadCount} unread`}>{chat.unreadCount}</span>}
        </span>
        <span className="chat-row__people" style={{ display: 'block' }}>{plural(chat.peopleCount, 'person', 'people')}</span>
      </span>
    </button>
  );
}

// The title placeholder is the likely title in invisible text, so it wraps onto as many lines as the real one.
function LikesSkeleton({ rows, title }) {
  return (
    <section className="likes-box" aria-label="Groups that liked you" aria-busy="true">
      <div className="likes-box__title" aria-hidden="true">
        <span className="skeleton skeleton--words">{title}</span>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="like-row">
          <Skeleton width={48} height={48} radius={14} />
          <div className="like-row__info">
            <Skeleton text={16} width={i % 2 ? '50%' : '65%'} />
            <Skeleton text={14} width="90%" />
            <Skeleton text={14} width={i % 2 ? '55%' : '40%'} />
          </div>
          <div className="like-row__actions">
            <Skeleton width={44} height={44} radius={14} />
            <Skeleton width={80} height={44} radius={14} />
          </div>
        </div>
      ))}
    </section>
  );
}

function ChatListSkeleton() {
  return (
    <div className="chat-list" aria-busy="true">
      {CHAT_PLACEHOLDERS.map(([name, preview], i) => (
        <div key={i} className="chat-row chat-row--skeleton">
          <GroupPairSkeleton size={46} />
          <span className="chat-row__main">
            <span className="chat-row__top">
              <Skeleton text={17} width={name} />
              <Skeleton text={14} width={36} />
            </span>
            <Skeleton text={16} width={preview} />
            <Skeleton text={14} width={70} />
          </span>
        </div>
      ))}
    </div>
  );
}
