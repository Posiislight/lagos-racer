import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { shouldPauseForRotate, shouldPromptRotate } from './rotate';

const COARSE = '(pointer: coarse)';
const PORTRAIT = '(orientation: portrait)';

function read(): boolean {
  return shouldPromptRotate(matchMedia(COARSE).matches, matchMedia(PORTRAIT).matches);
}

/** Full-screen "turn your phone sideways" overlay for touch devices held upright; pauses a solo race while it shows. */
export function RotatePrompt() {
  const [prompting, setPrompting] = useState(read);
  const screen = useGame(s => s.screen);
  const online = useGame(s => s.online);
  const paused = useGame(s => s.paused);
  const resultsShowing = useGame(s => s.results !== null);

  useEffect(() => {
    const queries = [matchMedia(COARSE), matchMedia(PORTRAIT)];
    const update = () => setPrompting(read());
    queries.forEach(q => (q.addEventListener ? q.addEventListener('change', update) : q.addListener(update)));
    update();
    return () => queries.forEach(q => (q.removeEventListener ? q.removeEventListener('change', update) : q.removeListener(update)));
  }, []);

  useEffect(() => {
    if (shouldPauseForRotate(prompting, screen, online, paused, resultsShowing)) useGame.getState().setPaused(true);
  }, [prompting, screen, online, paused, resultsShowing]);

  if (!prompting) return null;
  return (
    <div className="rotate-prompt" role="alert">
      <div className="rotate-phone" aria-hidden="true" />
      <p>Turn your phone sideways to play</p>
    </div>
  );
}
