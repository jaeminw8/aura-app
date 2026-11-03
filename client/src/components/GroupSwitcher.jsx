import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

// Active-group pill with a dropdown of the user's groups.
export default function GroupSwitcher({ groups, activeGroupId, onSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!active) return null;
  return (
    <div className="group-switch" ref={ref}>
      <button
        type="button"
        className="group-switch__pill"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar initials={active.initials} solid size={44} />
        <span className="sr-only">Switch group. Acting as </span>
        <span className="group-switch__name">{active.name}</span>
        <Icon name="chevronDown" size={20} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="menuitemradio"
              aria-checked={g.id === active.id}
              className="menu__item"
              onClick={() => {
                setOpen(false);
                if (g.id !== active.id) onSwitch(g.id);
              }}
            >
              <Avatar initials={g.initials} color={g.avatarColor} size={36} shape="square" />
              {g.name}
              {g.id === active.id ? <Icon name="check" size={18} className="muted-small" /> : <span className="muted-small">{g.memberCount}/10</span>}
            </button>
          ))}
          <a className="menu__item" href="#/profile" onClick={() => setOpen(false)}>
            <Icon name="plus" size={20} /> Create or join a group
          </a>
        </div>
      )}
    </div>
  );
}
