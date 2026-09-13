// Minimal, dependency-free stroke-icon set (24x24, currentColor) used throughout the UI.
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

export const MicIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </svg>
);

export const MicOffIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M9 9v2a3 3 0 0 0 4.6 2.55" />
    <path d="M15 6.5V5a3 3 0 0 0-5.9-.7" />
    <path d="M5 10a7 7 0 0 0 10.6 6" />
    <path d="M12 19v3" />
    <path d="M2 2l20 20" />
  </svg>
);

export const CameraIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="M16 10l6-3v10l-6-3" />
  </svg>
);

export const CameraOffIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M16 10l6-3v10l-4.5-2.25" />
    <path d="M2 6h10a2 2 0 0 1 2 2v7" />
    <path d="M2 2l20 20" />
    <path d="M2 8.5V16a2 2 0 0 0 2 2h9" />
  </svg>
);

export const ScreenShareIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M12 8v5" />
    <path d="M9.5 10.5 12 8l2.5 2.5" />
  </svg>
);

export const RecordIcon = (p) => (
  <svg {...base} {...p} fill="none">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  </svg>
);

export const StopIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const MessageIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 4h16v12H8l-4 4V4z" />
  </svg>
);

export const PhoneOffIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M10.7 6.3a16 16 0 0 1 3-.3c.6 0 1 .4 1.1 1l.6 3.2a1 1 0 0 1-.3 1L13.5 12.7" />
    <path d="M6.3 10.7 4.7 12.3a1 1 0 0 0-.3 1l.6 3.2c.1.6.5 1 1.1 1a16 16 0 0 0 9.3-3.2" />
    <path d="M2 2l20 20" />
  </svg>
);

export const UsersIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    <circle cx="17" cy="8" r="2.5" />
    <path d="M17 14c2.8.4 5 2.5 5 6" />
  </svg>
);

export const CopyIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const SendIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </svg>
);

export const CloseIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </svg>
);

export const LockIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export const ChevronRightIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
