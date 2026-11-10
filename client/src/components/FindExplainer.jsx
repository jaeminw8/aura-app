import Icon from './Icon.jsx';
import { Sheet } from './ui.jsx';

// Remembers (per browser) that this person has seen the explainer, so it only opens by itself once.
const SEEN_KEY = 'aura.findExplainerSeen';
export function hasSeenExplainer() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
export function markExplainerSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: it just shows again next time */ }
}

// First-time "how Find works" sheet. User testing showed people thought Connect meant joining the other group.
export default function FindExplainer({ groupName, isDesktop, onClose }) {
  const steps = [
    ['users', `You see one group at a time, picked for ${groupName}.`],
    ['userPlus', `Connect says ${groupName} wants to meet them. You don't join their group.`],
    ['messages', 'If they connect back, it\'s a match and both groups get one group chat.'],
    ['x', 'Pass skips them. They\'re never told.'],
  ];
  return (
    <Sheet title="How Find works" onClose={onClose}>
      <p className="explainer__lead">Like a dating app, but for friend groups.</p>
      <ol className="explainer__steps">
        {steps.map(([icon, text]) => (
          <li key={icon} className="explainer__step">
            <span className="explainer__icon"><Icon name={icon} size={22} /></span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      {!isDesktop && <p className="explainer__tip">Tip: swipe a card right to connect or left to pass.</p>}
      <button type="button" className="btn btn--primary btn--block" onClick={onClose} autoFocus>Got it</button>
    </Sheet>
  );
}
