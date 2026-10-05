/** A touch device held upright gets the "turn your phone sideways" prompt. */
export function shouldPromptRotate(coarse: boolean, portrait: boolean): boolean {
  return coarse && portrait;
}

/** A solo race pauses when the prompt appears; online races cannot pause. */
export function shouldPauseForRotate(prompting: boolean, screen: string, online: boolean, paused: boolean, resultsShowing: boolean): boolean {
  return prompting && screen === 'race' && !online && !paused && !resultsShowing;
}
