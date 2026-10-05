import { formatNaira } from '../config/economy';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

/** "2nd place: ★★ = ₦60,000": what a finishing place earns, for the Results screen and the race intro. */
export const payoutLine = (place: number, stars: number, naira: number) =>
  `${ORDINAL[place - 1] ?? `${place}th`} place: ${'★'.repeat(stars) || 'no stars'} = ${formatNaira(naira)}`;

/** The solo "nothing earned" line: the duel (pass place 1) is won, not placed. */
export const noStarsText = (passPlace?: number) =>
  passPlace === 1 ? 'No stars, no naira. Beat her to earn stars.' : `No stars, no naira. Finish top ${passPlace ?? 3}.`;

/** `of` star glyphs, `earned` of them filled. One image for screen readers. */
export function Stars({ earned, of = 3, label }: { earned: number; of?: number; label?: string }) {
  return (
    <span className="stars" role="img" aria-label={label ?? `${earned} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (i < earned ? '★' : '☆')).join('')}
    </span>
  );
}
