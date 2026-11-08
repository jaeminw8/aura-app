import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Loader } from './components/Loading.jsx';
import TabBar, { SideNav } from './components/TabBar.jsx';
import { useToast } from './components/ui.jsx';
import { FinishAccount, SignIn, SignUp } from './screens/Auth.jsx';
import ChatScreen from './screens/ChatScreen.jsx';
import FindScreen from './screens/FindScreen.jsx';
import MessagesScreen from './screens/MessagesScreen.jsx';
import { NoGroupGate, ProfileSetup } from './screens/Onboarding.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';
import { supabase } from './supabase.js';

// Hash routes: #/find, #/messages, #/messages/:chatId, #/profile; signed out: #/signup (default), #/signin
function parseRoute() {
  const [, tab = 'find', id] = window.location.hash.split('/');
  if (tab === 'messages' && id) return { tab: 'messages', chatId: Number(id) };
  if (tab === 'signin' || tab === 'signup') return { tab, auth: true };
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
  // undefined while Supabase restores a saved session, then the session or null (signed out).
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const authUserId = session?.user.id ?? null;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.hash = '#/signin';
  }, []);

  const refreshMe = useCallback(async () => {
    const forUser = sessionRef.current?.user.id;
    if (!forUser) return null;
    const stillCurrent = () => sessionRef.current?.user.id === forUser;
    try {
      const data = await api('/me');
      if (stillCurrent()) {
        setMe(data);
        setNeedsAccount(false);
        setLoadError(null);
      }
      return data;
    } catch (err) {
      if (!stillCurrent()) return null;
      if (err.code !== 'NO_PROFILE') {
        setLoadError(err);
        return null;
      }
      // New account: create its users row from the names given at sign up.
      const { firstName, lastName, city } = sessionRef.current.user.user_metadata ?? {};
      if (!(firstName && lastName && city)) {
        setNeedsAccount(true);
        return null;
      }
      try {
        await api('/users', { method: 'POST', body: { firstName, lastName, city } });
      } catch (createErr) {
        // ACCOUNT_EXISTS: another tab (or React's double effect) created it first; that's fine.
        if (createErr.code !== 'ACCOUNT_EXISTS') {
          setNeedsAccount(true);
          return null;
        }
      }
      return refreshMe();
    }
  }, []);

  // A different account (or none): start over with that account's data.
  useEffect(() => {
    setMe(null);
    setNeedsAccount(false);
    setLoadError(null);
    if (authUserId) refreshMe();
  }, [authUserId, refreshMe]);

  // Leave #/signin or #/signup once signed in.
  useEffect(() => {
    if (authUserId && route.auth) window.location.hash = '#/find';
  }, [authUserId, route.auth]);

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
  if (session === undefined) {
    content = <Loader label="Loading…" />;
  } else if (!session) {
    content = route.tab === 'signin' ? <SignIn /> : <SignUp />;
  } else if (needsAccount) {
    content = <FinishAccount email={session.user.email} onDone={refreshMe} onSignOut={signOut} />;
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
    const props = { me, setMe, refreshMe, onSwitchGroup: switchGroup, onSignOut: signOut, isDesktop };
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
            <p className="sidebar__account">Signed in as <strong>{session.user.email}</strong></p>
            <button type="button" className="btn btn--outline btn--block" onClick={signOut}>Sign out</button>
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
      {content}
    </div>
  );
}
