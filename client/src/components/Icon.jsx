// Inline stroke icons (24px grid, 2px stroke, round caps), no icon font, no emoji.
const PATHS = {
  find: <><rect x="6" y="3" width="13" height="17" rx="2.5" /><path d="M4 7v12.5A2.5 2.5 0 0 0 6.5 22H15" /></>,
  messages: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-5 4v-15.5Z" />,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  userPlus: <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5v-4L15.5 4.5Z" />,
  archive: <><rect x="3.5" y="4" width="17" height="4.5" rx="1" /><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4" /></>,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />,
  sliders: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 4.5v5M10 14.5v5" />,
  send: <path d="M4.5 12 20 4.5 15 20l-3-6.5-7.5-1.5ZM12 13.5 20 4.5" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  link: <><path d="M10 13.5 14 9.5" /><path d="M7.5 16.5 6 18a3.2 3.2 0 0 1-4.5-4.5l3-3a3.2 3.2 0 0 1 4.5 0M16.5 7.5 18 6a3.2 3.2 0 0 1 4.5 4.5l-3 3a3.2 3.2 0 0 1-4.5 0" /></>,
  pin: <><path d="m8 4 8 0 1 5-3 3v6l-2 2-2-2v-6L7 9l1-5Z" /><path d="M12 20v2" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.75" /><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5" /></>,
  restore: <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4.5V9h4.5" />,
  logout: <path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4M10 16.5 5.5 12 10 7.5M5.5 12H15" />,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.5a6.5 6.5 0 0 1 3 5.5" /></>,
  sparkle: <path d="M12 3.5Q13.2 10.8 20.5 12 13.2 13.2 12 20.5 10.8 13.2 3.5 12 10.8 10.8 12 3.5Z" />,
};

export default function Icon({ name, size = 22, strokeWidth = 2, className, title }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
