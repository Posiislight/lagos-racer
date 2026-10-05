/** One card of the first-race how-to. */
export type HowToStep = { title: string; body: string };

/** Show the how-to to someone who has never raced on this phone (a returning account with progress skips it). */
export function shouldShowHowTo(onboarded: boolean, races: number, passed: number): boolean {
  return !onboarded && races === 0 && passed === 0;
}

/** The steps, worded for the controls the player actually has. */
export function howToSteps(input: 'keys' | 'touch'): HowToStep[] {
  const touch = input === 'touch';
  return [
    {
      title: 'Drive',
      body: touch
        ? 'Hold the left or right side of the screen to steer. Tap GAS to go, BRAKE to stop.'
        : 'Arrow keys or WASD to steer, go and brake. Hold C to drift round corners.',
    },
    {
      title: 'Grab power-ups',
      body: touch
        ? 'Drive through the glowing boxes, then tap USE to fire juju, drop crude oil or raise odeshi.'
        : 'Drive through the glowing boxes, then press Space to fire juju, drop crude oil or raise odeshi.',
    },
    {
      title: 'Use your special',
      body: `Your driver's charge ring fills as you race. When it glows, ${touch ? 'tap it' : 'press Q'} for a big move.`,
    },
    {
      title: 'Finish on the podium',
      body: 'Come 1st, 2nd or 3rd to earn stars and naira, and unlock the next race. Oya go!',
    },
  ];
}
