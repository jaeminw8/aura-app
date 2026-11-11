import Icon from './Icon.jsx';
import BrandLogo from './BrandLogo.jsx';

const TABS = [
  { id: 'find', label: 'Find', icon: 'find' },
  { id: 'messages', label: 'Messages', icon: 'messages' },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

const badgeText = (n) => (n > 99 ? '99+' : n);

// Phones: fixed bottom tab bar.
export default function TabBar({ current, unread }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <a key={tab.id} href={`#/${tab.id}`} className="tabbar__item" aria-current={current === tab.id ? 'page' : undefined}>
          <Icon name={tab.icon} size={26} />
          {tab.label}
          {tab.id === 'messages' && unread > 0 && (
            <span className="tabbar__badge" aria-label={`${unread} unread`}>{badgeText(unread)}</span>
          )}
        </a>
      ))}
    </nav>
  );
}

// Desktop: the same destinations as a left sidebar.
export function SideNav({ current, unread, children }) {
  return (
    <aside className="sidebar">
      <a href="#/find" className="sidebar__brand" aria-label="aura home"><BrandLogo label="aura home" /></a>
      <nav className="sidebar__nav" aria-label="Main">
        {TABS.map((tab) => (
          <a key={tab.id} href={`#/${tab.id}`} className="sidebar__item" aria-current={current === tab.id ? 'page' : undefined}>
            <Icon name={tab.icon} size={24} />
            <span>{tab.label}</span>
            {tab.id === 'messages' && unread > 0 && (
              <span className="count-dot sidebar__badge" aria-label={`${unread} unread`}>{badgeText(unread)}</span>
            )}
          </a>
        ))}
      </nav>
      <div className="sidebar__foot">{children}</div>
    </aside>
  );
}
