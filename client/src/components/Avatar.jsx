import { Skeleton } from './Loading.jsx';

// Initials on a pastel. People are circles, groups are rounded squares.
const INK_ON = {
  '#FDDCCB': '#9A3412',
  '#DCEBFD': '#1E40AF',
  '#DDF3E0': '#166534',
  '#F6DCF0': '#86198F',
  '#FFF1B8': '#854D0E',
  '#E6E1FF': '#4C1D95',
  '#ECE8FF': '#4C1D95',
};

export default function Avatar({ initials, color = '#ECE8FF', size = 44, shape = 'circle', className = '', solid = false }) {
  const style = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.36),
    background: solid ? 'var(--accent)' : color,
    color: solid ? '#fff' : INK_ON[color?.toUpperCase()] ?? 'var(--ink)',
    borderRadius: shape === 'circle' ? '50%' : Math.round(size * 0.3),
  };
  return (
    <span className={`avatar ${className}`} style={style} aria-hidden="true">
      {initials}
    </span>
  );
}

export function AvatarStack({ people, size = 34, max = 6 }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="avatar-stack" style={{ '--size': `${size}px` }}>
      {shown.map((p) => (
        <Avatar key={p.id} initials={p.initials} color={p.avatarColor} size={size} className="avatar-stack__item" />
      ))}
      {extra > 0 && <span className="avatar avatar-stack__item avatar-stack__more" style={{ width: size, height: size }}>+{extra}</span>}
    </span>
  );
}

// Two group avatars, overlapped (chat rows and chat header).
export function GroupPair({ mine, other, size = 44 }) {
  return (
    <span className="group-pair" style={{ width: size * 1.35, height: size * 1.35 }}>
      <Avatar initials={mine.initials} size={size} shape="square" solid className="group-pair__back" />
      <Avatar initials={other.initials} color={other.avatarColor} size={size} shape="square" className="group-pair__front" />
    </span>
  );
}

// GroupPair's placeholder while chats load.
export function GroupPairSkeleton({ size = 44 }) {
  const square = { width: size, height: size, radius: Math.round(size * 0.3) };
  return (
    <span className="group-pair" style={{ width: size * 1.35, height: size * 1.35 }}>
      <Skeleton {...square} className="group-pair__back" />
      <Skeleton {...square} className="group-pair__front" />
    </span>
  );
}
