import { useRef, useState } from 'react';

const THRESHOLD = 90; // px of sideways drag that counts as a decision

// Touch shortcut for the Connect / Pass buttons: drag the card right to connect, left to pass.
// Only touch (and pen) drags count, so mouse users can still select text. The buttons stay the main way.
export default function SwipeCard({ onSwipe, disabled, children }) {
  const start = useRef(null);
  const [dx, setDx] = useState(0);

  const down = (e) => {
    if (disabled || e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
  };
  const move = (e) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    // Decide once whether this is a sideways swipe or a vertical scroll.
    if (s.horizontal === null && (Math.abs(x) > 8 || Math.abs(y) > 8)) {
      s.horizontal = Math.abs(x) > Math.abs(y);
      if (s.horizontal) {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      }
    }
    if (s.horizontal) {
      s.dx = x;
      setDx(x);
    }
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    // Read the distance from the ref: a quick flick can end before React re-renders.
    if (s?.horizontal && Math.abs(s.dx ?? 0) >= THRESHOLD) onSwipe(s.dx > 0 ? 'connect' : 'pass');
    setDx(0);
  };

  const hint = dx >= THRESHOLD / 2 ? 'connect' : dx <= -THRESHOLD / 2 ? 'pass' : null;
  return (
    <div
      className={`swipe${dx ? ' swipe--dragging' : ''}`}
      style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 30}deg)` } : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {hint && (
        <span className={`swipe__stamp swipe__stamp--${hint}`} aria-hidden="true">
          {hint === 'connect' ? 'Connect' : 'Pass'}
        </span>
      )}
      {children}
    </div>
  );
}
