import { useEffect, useState } from 'react';

// Screen readers announce a change to a live region that's already on the page, not one that
// arrives with its text in it, so the label goes in shortly after the region mounts. Loads that
// finish sooner than this aren't announced at all.
const ANNOUNCE_AFTER_MS = 300;

// The role="status" message for a loading state: visually hidden next to skeletons, shown under a spinner.
export function LoadingStatus({ label, visible = false }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return <span role="status" className={visible ? 'loading__label' : 'sr-only'}>{ready ? label : ''}</span>;
}

export function Spinner({ size = 24 }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 9)) }}
      aria-hidden="true"
    />
  );
}

// Spinner and label, for loads whose layout isn't known yet.
export function Loader({ label, compact = false }) {
  return (
    <div className={`loading ${compact ? 'loading--compact' : ''}`}>
      <Spinner size={compact ? 20 : 30} />
      <LoadingStatus label={label} visible />
    </div>
  );
}

// A placeholder shape. With `text` (a font size in px) it stands in for one line of text at that size
// and is as tall as that line, so a skeleton row is as tall as the row that replaces it. Put
// skeletons in an aria-busy container and pair them with a LoadingStatus.
export function Skeleton({ width, height, radius, text, className = '' }) {
  if (text) {
    return (
      <span className={`skeleton-line ${className}`} style={{ width, fontSize: text }} aria-hidden="true">
        <span className="skeleton" />
      </span>
    );
  }
  return <span className={`skeleton ${className}`} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}
