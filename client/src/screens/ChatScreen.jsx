import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Avatar, { GroupPair, GroupPairSkeleton } from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { LoadingStatus, Skeleton } from '../components/Loading.jsx';
import { formatTime, plural } from '../format.js';
import { canRetry, friendlyError } from '../friendlyError.js';
import { usePoll } from '../usePoll.js';

const POLL_MS = 5000;
// While someone is typing the chat polls faster, and your composer pings at most this often. The
// server shows a ping for 5s, so a poll always lands before a steady typist's last ping runs out.
const POLL_WHILE_TYPING_MS = 2000;
const TYPING_PING_MS = 1000;
const NEAR_BOTTOM_PX = 120;
const MAX_RECEIPT_AVATARS = 5;
const CHAT_GONE = ['NOT_IN_CHAT', 'CHAT_NOT_FOUND'];
// Placeholder messages while a chat opens: theirs (with the sender's avatar on the first of a run) and yours.
const BUBBLE_PLACEHOLDERS = [
  { width: 180, avatar: true },
  { width: 120 },
  { width: 160, mine: true },
  { width: 200, avatar: true },
  { width: 110, mine: true },
];

const newestId = (messages) => messages.reduce((max, m) => Math.max(max, m.id), 0);

// Adds messages once each (polls repeat the ones you sent), keeping the list in id order.
function mergeMessages(list, incoming) {
  const ids = new Set(list.map((m) => m.id));
  const added = incoming.filter((m) => !ids.has(m.id));
  return added.length ? [...list, ...added].sort((a, b) => a.id - b.id) : list;
}

// Who to show under which message. Each person goes under the newest message on screen that they've
// read, unless they sent it. "Delivered" goes under your latest message until someone else reads it.
// The client and API deploy separately, so `reads` can be missing for a moment during a deploy.
function readReceipts(messages, reads = []) {
  const readersByMessage = new Map();
  for (const { messageId, user } of reads) {
    const message = messages.findLast((m) => m.id <= messageId);
    if (message && message.sender?.id !== user.id) {
      readersByMessage.set(message.id, [...(readersByMessage.get(message.id) ?? []), user]);
    }
  }
  const myLatest = messages.findLast((m) => m.mine);
  const isRead = myLatest && reads.some((r) => r.messageId >= myLatest.id);
  return { readersByMessage, deliveredId: myLatest && !isRead ? myLatest.id : null };
}

// The API sends how long each person's typing lasts unless they keep going; this client counts that down.
const typingDeadlines = (typing = []) => typing.map((t) => ({ user: t.user, until: Date.now() + t.msLeft }));

// "Avery is typing…", "Avery and Maya are typing…", "Avery, Maya and 2 others are typing…"
function typingText(names) {
  if (!names.length) return '';
  const shown = names.length > 3 ? [...names.slice(0, 2), plural(names.length - 2, 'other')] : names;
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
  return `${list} ${names.length === 1 ? 'is' : 'are'} typing…`;
}

// Phones: a full screen with a back arrow. Desktop: `embedded` in the Messages split view,
// calling onActivity after it marks the chat read or sends, so the chat list can refresh.
export default function ChatScreen({ chatId, refreshMe, embedded = false, onActivity }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Why the last send failed, shown right above the message box. The typed text stays put.
  const [sendError, setSendError] = useState(null);
  const composer = useRef(null);
  const [unseen, setUnseen] = useState(false);
  const [typers, setTypers] = useState([]); // others who are typing: { user, until }
  const lastTypingPing = useRef(0); // when your composer last pinged; 0 = you're not shown as typing
  const bottom = useRef(null);
  const log = useRef(null);
  const jump = useRef(null);
  const cursor = useRef(0); // newest message id from a GET; polls ask only for messages after it
  const shown = useRef(null); // the message list last on screen, to tell when messages arrive
  const atBottom = useRef(true);
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;

  const load = useCallback(async () => {
    try {
      const result = await api(`/chats/${chatId}/messages`);
      cursor.current = newestId(result.messages);
      setData(result);
      setTypers(typingDeadlines(result.typing));
    } catch (err) {
      setError(err);
    }
  }, [chatId]);

  // Load and mark read (server does it on GET); the poll below then picks up new messages.
  useEffect(() => {
    load().then(() => {
      refreshMe();
      activityRef.current?.();
    });
  }, [load, refreshMe]);

  // A blip (network, 5xx) keeps the chat on screen and retries on the next tick.
  const poll = async () => {
    try {
      const { messages, hasMore, reads, typing } = await api(`/chats/${chatId}/messages?after=${cursor.current}`);
      cursor.current = Math.max(cursor.current, newestId(messages));
      setTypers(typingDeadlines(typing));
      setData((d) => {
        const merged = mergeMessages(d.messages, messages);
        const nextReads = JSON.stringify(reads) === JSON.stringify(d.reads) ? d.reads : reads;
        return merged === d.messages && nextReads === d.reads ? d : { ...d, messages: merged, reads: nextReads };
      });
      if (!messages.length) return false;
      activityRef.current?.(); // the server marked it read; the desktop list re-sorts
      return hasMore;
    } catch (err) {
      if (CHAT_GONE.includes(err.code)) setError(err);
      return false;
    }
  };
  usePoll(poll, typers.length ? POLL_WHILE_TYPING_MS : POLL_MS, Boolean(data) && !error);

  // Drop each typist when their time runs out, even between polls.
  useEffect(() => {
    if (!typers.length) return undefined;
    const next = Math.min(...typers.map((t) => t.until));
    const timer = setTimeout(() => setTypers((ts) => ts.filter((t) => t.until > Date.now())), Math.max(0, next - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [typers]);

  // Tell the others you're typing (throttled), and that you've stopped when you clear the box.
  const pingTyping = (text) => {
    if (!text.trim()) {
      if (lastTypingPing.current) api(`/chats/${chatId}/typing`, { method: 'DELETE' }).catch(() => {});
      lastTypingPing.current = 0;
    } else if (Date.now() - lastTypingPing.current >= TYPING_PING_MS) {
      lastTypingPing.current = Date.now();
      api(`/chats/${chatId}/typing`, { method: 'POST' }).catch(() => {});
    }
  };
  // Leaving the chat mid-sentence clears your typing right away instead of after 5s.
  useEffect(() => () => {
    if (lastTypingPing.current) api(`/chats/${chatId}/typing`, { method: 'DELETE' }).catch(() => {});
  }, [chatId]);

  // The first load and your own new messages scroll to the bottom. Others' messages only do if you
  // were already near it (a poll can also slot one in just above yours); otherwise the
  // "New messages" button shows up.
  useEffect(() => {
    if (!data || data.messages === shown.current) return;
    const first = shown.current === null;
    const newest = data.messages.at(-1);
    const sentNow = newest?.mine && newest.id !== shown.current?.at(-1)?.id;
    shown.current = data.messages;
    if (first || atBottom.current || sentNow) bottom.current?.scrollIntoView({ block: 'end' });
    else setUnseen(true);
  }, [data]);

  // A receipt appearing under the last message makes the list taller; stay at the bottom if you were.
  const reads = data?.reads;
  useEffect(() => {
    if (reads && atBottom.current) bottom.current?.scrollIntoView({ block: 'end' });
  }, [reads]);
  const shownMessages = data?.messages;
  const receipts = useMemo(() => (shownMessages ? readReceipts(shownMessages, reads) : null), [shownMessages, reads]);
  const typingLabel = typingText(typers.map((t) => t.user.firstName));
  useEffect(() => {
    if (typingLabel && atBottom.current) bottom.current?.scrollIntoView({ block: 'end' });
  }, [typingLabel]);

  // The button unmounts once you're at the newest message; keep keyboard focus in the chat.
  const hideJump = () => {
    if (document.activeElement === jump.current) log.current?.focus({ preventScroll: true });
    setUnseen(false);
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom.current) hideJump();
  };

  const jumpToNewest = () => {
    bottom.current?.scrollIntoView({ block: 'end' });
    hideJump();
  };

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const { message } = await api(`/chats/${chatId}/messages`, { method: 'POST', body: { body } });
      // Shown now, but the cursor stays put: the next poll returns it again (deduped) along with
      // anything the other group posted just before it.
      setData((d) => ({ ...d, messages: mergeMessages(d.messages, [message]) }));
      setDraft('');
      lastTypingPing.current = 0; // sending cleared it on the server
      activityRef.current?.();
    } catch (err) {
      setSendError(err);
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div className="screen">
        {!embedded && <a className="link-btn" href="#/messages"><Icon name="chevronLeft" size={18} /> Messages</a>}
        <div className="empty" style={{ marginTop: 16 }}>
          <h2>Can't open this chat</h2>
          <p>{friendlyError(error)}</p>
          {canRetry(error) && (
            <button type="button" className="btn btn--primary" onClick={() => { setError(null); load(); }}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!data) return <ChatSkeleton embedded={embedded} />;

  const { chat, messages, participants } = data;
  return (
    <div className={`chat-screen ${embedded ? 'chat-screen--embedded' : ''}`}>
      <header className="chat-head">
        {!embedded && <BackButton />}
        <GroupPair mine={chat.myGroup} other={chat.otherGroup} size={36} />
        <div>
          <div className="chat-head__name">{chat.name}</div>
          <div className="chat-head__meta">{plural(chat.peopleCount, 'person', 'people')}</div>
        </div>
      </header>

      <div ref={log} className="chat-body" role="log" aria-label="Messages" tabIndex={0} onScroll={onScroll}>
        <p className="chat-intro">
          {chat.myGroup.name} matched with {chat.otherGroup.name}.<br />
          {participants.map((p) => p.firstName).join(', ')}
        </p>
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showSender = !m.mine && (!prev || prev.sender?.id !== m.sender?.id);
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showSender && <div className="msg__sender" aria-hidden="true">{m.sender?.firstName ?? 'Former member'}</div>}
              <div className={`msg ${m.mine ? 'msg--mine' : ''}`}>
                <span className="sr-only">{m.mine ? 'You' : m.sender?.firstName ?? 'Former member'}: </span>
                {!m.mine && (showSender && m.sender
                  ? <Avatar initials={m.sender.initials} color={m.sender.avatarColor} size={36} />
                  : <span className="msg__spacer" />)}
                <div className="msg__bubble">{m.body}</div>
                <span className="msg__time">{formatTime(m.createdAt)}</span>
              </div>
              {receipts.readersByMessage.has(m.id) && <ReadBy readers={receipts.readersByMessage.get(m.id)} mine={m.mine} />}
              {receipts.deliveredId === m.id && <div className="receipts receipts--mine" aria-live="off">Delivered</div>}
            </div>
          );
        })}
        {typingLabel && (
          <div className="typing" aria-hidden="true">
            <span className="typing__dots"><span /><span /><span /></span>
            {typingLabel}
          </div>
        )}
        <div ref={bottom} />
      </div>
      {/* Outside the log, so typing is announced as a status rather than as a message. */}
      <p className="sr-only" role="status">{typingLabel}</p>

      {unseen && (
        <div className="chat-jump">
          <button ref={jump} type="button" className="btn btn--primary btn--sm" onClick={jumpToNewest}>
            <Icon name="chevronDown" size={18} /> New messages
          </button>
        </div>
      )}

      {sendError && (
        <div className="composer-error">
          <p id="composer-error" role="alert">{friendlyError(sendError)}</p>
          {canRetry(sendError) && (
            <button type="button" className="link-btn" disabled={sending} onClick={() => composer.current?.requestSubmit()}>
              Try again
            </button>
          )}
        </div>
      )}
      <form ref={composer} className="composer" onSubmit={send}>
        <label className="sr-only" htmlFor="composer">Message</label>
        <input
          id="composer"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            pingTyping(e.target.value);
            if (sendError) setSendError(null);
          }}
          aria-invalid={sendError ? true : undefined}
          aria-describedby={sendError ? 'composer-error' : undefined}
          placeholder={`Message ${chat.otherGroup.name}`}
          maxLength={2000}
          autoComplete="off"
        />
        <button type="submit" className="icon-btn" aria-label="Send" disabled={!draft.trim() || sending}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}

// aria-live="off": the log announces new messages, not every time someone reads one.
function ReadBy({ readers, mine }) {
  const names = readers.map((r) => r.firstName).join(', ');
  const extra = readers.length - MAX_RECEIPT_AVATARS;
  return (
    <div className={`receipts ${mine ? 'receipts--mine' : ''}`} aria-live="off" title={`Read by ${names}`}>
      <span className="sr-only">Read by {names}</span>
      {readers.slice(0, MAX_RECEIPT_AVATARS).map((r) => <Avatar key={r.id} initials={r.initials} color={r.avatarColor} size={20} />)}
      {extra > 0 && <span aria-hidden="true">+{extra}</span>}
    </div>
  );
}

function BackButton() {
  return (
    <a href="#/messages" className="icon-btn icon-btn--plain" aria-label="Back to Messages">
      <Icon name="chevronLeft" size={26} />
    </a>
  );
}

function ChatSkeleton({ embedded }) {
  return (
    <div className={`chat-screen ${embedded ? 'chat-screen--embedded' : ''}`}>
      <header className="chat-head">
        {!embedded && <BackButton />}
        <GroupPairSkeleton size={36} />
        <div>
          <Skeleton text={17} width={150} />
          <Skeleton text={14} width={70} />
        </div>
      </header>
      <div className="chat-body" aria-busy="true">
        {BUBBLE_PLACEHOLDERS.map((b, i) => (
          <div key={i} className={`msg ${b.mine ? 'msg--mine' : ''}`}>
            {!b.mine && (b.avatar ? <Skeleton width={36} height={36} radius="50%" /> : <span className="msg__spacer" />)}
            <Skeleton width={b.width} height={42} radius={b.mine ? '20px 20px 6px 20px' : '20px 20px 20px 6px'} />
          </div>
        ))}
      </div>
      <div className="composer">
        <Skeleton height={48} radius={999} className="skeleton--grow" />
        <Skeleton width={48} height={48} radius="50%" />
      </div>
      <LoadingStatus label="Opening chat…" />
    </div>
  );
}
