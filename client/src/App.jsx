import { useCallback, useEffect, useRef, useState } from 'react';
import { api, readStoredUserId, setApiUser, storeUserId } from './api.js';
import { Loader } from './components/Loading.jsx';
import SignedInBar from './components/SignedInBar.jsx';
import TabBar, { SideNav } from './components/TabBar.jsx';
import { useToast } from './components/ui.jsx';
import ChatScreen from './screens/ChatScreen.jsx';
import FindScreen from './screens/FindScreen.jsx';
import MessagesScreen from './screens/MessagesScreen.jsx';
import { NoGroupGate, ProfileSetup, Welcome } from './screens/Onboarding.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';

// Hash routes: #/find, #/messages, #/messages/:chatId, #/profile
function parseRoute() {
  const [, tab = 'find', id] = window.location.hash.split('/');
  if (tab === 'messages' && id) return { tab: 'messages', chatId: Number(id) };
  return { tab: ['find', 'messages', 'profile'].includes(tab) ? tab : 'find' };
}

function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

// Wide screens (laptops, desktops) get the sidebar + multi-column layout;
// phones and narrow windows keep the original phone layout.
const DESKTOP_QUERY = '(min-width: 1024px)';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export default function App() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const toast = useToast();
  const route = useRoute();
  const [userId, setUserId] = useState(() => {
    const id = readStoredUserId();
    setApiUser(id);
    return id;
  });
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const userRef = useRef(userId);

  const signIn = useCallback((id) => {
    storeUserId(id);
    setApiUser(id);
    userRef.current = id;
    setMe(null);
    setLoadError(null);
    setUserId(id);
    if (id) window.location.hash = '#/find';
  }, []);

  const refreshMe = useCallback(async () => {
    const forUser = userRef.current;
    if (!forUser) return null;
    try {
      const data = await api('/me');
      if (userRef.current === forUser) {
        setMe(data);
        setLoadError(null);
      }
      return data;
    } catch (err) {
      if (err.code === 'UNKNOWN_USER' || err.code === 'NOT_SIGNED_IN') signIn(null);
      else setLoadError(err);
      return null;
    }
  }, [signIn]);

  useEffect(() => {
    if (userId) refreshMe();
  }, [userId, refreshMe]);

  // Server says "no group" / "profile incomplete" from any screen: re-check the gate.
  useEffect(() => {
    const onGate = () => refreshMe();
    window.addEventListener('aura:gate', onGate);
    return () => window.removeEventListener('aura:gate', onGate);
  }, [refreshMe]);

  const switchGroup = useCallback(async (groupId) => {
    try {
      await api('/me/active-group', { method: 'PATCH', body: { groupId } });
      const data = await refreshMe();
      const name = data?.groups.find((g) => g.id === groupId)?.name;
      if (name) toast(`Now acting as ${name}.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  }, [refreshMe, toast]);

  let content;
  if (!userId) {
    content = <Welcome onSignedIn={signIn} />;
  } else if (!me) {
    content = loadError ? (
      <div className="gate">
        <div className="empty">
          <h2>Can't load aura</h2>
          <p>{loadError.message}</p>
          <button type="button" className="btn btn--primary" onClick={refreshMe}>Try again</button>
        </div>
      </div>
    ) : (
      <Loader label="Loading…" />
    );
  } else if (!me.onboarding.profileComplete) {
    content = <ProfileSetup me={me} setMe={setMe} refreshMe={refreshMe} />;
  } else if (!me.onboarding.hasGroup) {
    content = <NoGroupGate refreshMe={refreshMe} />;
  } else if (route.chatId && !isDesktop) {
    return (
      <div className="frame">
        <ChatScreen key={route.chatId} chatId={route.chatId} refreshMe={refreshMe} />
      </div>
    );
  } else {
    const props = { me, setMe, refreshMe, onSwitchGroup: switchGroup, isDesktop };
    const screen = (
      <>
        {route.tab === 'find' && <FindScreen {...props} />}
        {route.tab === 'messages' && <MessagesScreen key={me.activeGroupId} chatId={route.chatId} {...props} />}
        {route.tab === 'profile' && <ProfileScreen {...props} />}
      </>
    );
    if (isDesktop) {
      return (
        <div className="frame frame--desktop">
          <SideNav current={route.tab} unread={me.unreadMessages}>
            <SignedInBar userId={userId} activeGroupId={me.activeGroupId} onChange={signIn} stacked />
          </SideNav>
          <main className="main">{screen}</main>
        </div>
      );
    }
    content = (
      <>
        {screen}
        <TabBar current={route.tab} unread={me.unreadMessages} />
      </>
    );
  }

  return (
    <div className="frame">
      {userId && <SignedInBar userId={userId} activeGroupId={me?.activeGroupId} onChange={signIn} />}
      {content}
    </div>
  );
}
