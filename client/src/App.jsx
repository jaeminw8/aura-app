import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Loader } from './components/Loading.jsx';
import TabBar, { SideNav } from './components/TabBar.jsx';
import { useToast } from './components/ui.jsx';
import { FinishAccount, SignIn, SignUp } from './screens/Auth.jsx';
import ChatScreen from './screens/ChatScreen.jsx';
import FindScreen from './screens/FindScreen.jsx';
import MessagesScreen from './screens/MessagesScreen.jsx';
import { JoinGroupScreen, NoGroupGate, ProfileSetup } from './screens/Onboarding.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';
import { APP_PATH, authHref } from './routes.js';
import { supabase } from './supabase.js';

// Hash routes: #/find, #/messages, #/messages/:chatId, #/profile.
// Signed out: #/signup (what a new visitor sees) and #/signin?next=/messages/7 (back to where you were).
function parseRoute() {
  const [path, query = ''] = window.location.hash.slice(1).split('?');
  const fullPath = query ? `${path}?${query}` : path;
  const [, tab = 'find', id] = path.split('/');
  // A bare URL (no hash) is a new visitor; any app hash is a page someone meant to open.
  const explicit = path !== '' && path !== '/';
  if (tab === 'signin' || tab === 'signup') {
    const next = new URLSearchParams(query).get('next');
    return { tab, auth: true, next: APP_PATH.test(next ?? '') ? next : null };
  }
  if (tab === 'messages' && id) return { tab: 'messages', chatId: Number(id), path, explicit };
  const known = ['find', 'messages', 'profile', 'join'].includes(tab);
  return { tab: known ? tab : 'find', path: known ? fullPath : '/find', inviteCode: tab === 'join' ? new URLSearchParams(query).get('code') ?? '' : '', explicit };
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

  // Logging out on purpose goes to plain Sign in; losing the session any other way (expired,
  // signed out in another tab) remembers the page so signing back in returns to it.
  const loggingOut = useRef(false);
  const signOut = useCallback(async () => {
    loggingOut.current = true;
    await supabase.auth.signOut();
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

  // Signed out on an app page: go to Sign in, remembering the page (replace, so Back doesn't bounce).
  useEffect(() => {
    if (session !== null || route.auth || !route.explicit) return;
    const next = loggingOut.current ? null : route.path;
    loggingOut.current = false;
    window.location.replace(authHref('signin', next));
  }, [session, route]);

  // Signed in on Sign in / Sign up: continue to the remembered page, or Find.
  useEffect(() => {
    if (authUserId && route.auth) window.location.replace(`#${route.next ?? '/find'}`);
  }, [authUserId, route]);

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
    // New visitors see Sign up; everyone else (including the moment before the redirect) sees Sign in.
    content = route.tab === 'signup' || (!route.auth && !route.explicit)
      ? <SignUp next={route.next} />
      : <SignIn next={route.next} />;
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
  } else if (route.tab === 'join') {
    content = <JoinGroupScreen inviteCode={route.inviteCode} refreshMe={refreshMe} />;
  } else if (!me.onboarding.hasGroup) {
    content = <NoGroupGate refreshMe={refreshMe} inviteCode={route.inviteCode} />;
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
            <button type="button" className="btn btn--outline btn--block" onClick={signOut}>Log out</button>
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
