/** The Gems symbol: a cut emerald-green gem. Sized by the font, so it sits inline with text. */
export function GemIcon({ size = '1.1em' }: { size?: string }) {
  return (
    <svg className="gem-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M8 4h16l6 8-14 17L2 12z" fill="#2fd6a0" stroke="#2a2118" strokeWidth="2" strokeLinejoin="round" />
      <path d="M2 12h28M11 12l5 17 5-17M8 4l3 8 5-8 5 8 3-8" fill="none" stroke="#2a2118" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 12l5-8 5 8z" fill="#9bf5d6" />
    </svg>
  );
}

/** The in-game naira symbol: a gold coin with a naira sign. */
export function NairaIcon({ size = '1.1em' }: { size?: string }) {
  return (
    <svg className="gem-icon" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="13" fill="#f5b400" stroke="#2a2118" strokeWidth="2" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#2a2118" strokeWidth="1" opacity=".35" />
      <path d="M11 22V10l10 12V10M9 14h14M9 18h14" fill="none" stroke="#2a2118" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
