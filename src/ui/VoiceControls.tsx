import { useNet } from '../net/store';
import { voiceSupported } from '../net/voice';

const icon = { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

const MIC_NOTE = {
  off: 'Mic off',
  asking: 'Allow the mic…',
  on: 'Mic on',
  denied: 'Mic blocked: allow it in your browser settings',
  unsupported: 'No voice on this browser',
} as const;

/** Mic and speaker buttons for a friends' room. Nothing is sent until the mic is switched on. */
export function VoiceControls({ compact = false }: { compact?: boolean }) {
  const { mic, speaker, voiceLinks, toggleMic, toggleSpeaker } = useNet();
  const quick = useNet(s => s.room?.quick !== undefined);
  if (quick || !voiceSupported()) return null;
  const micOn = mic === 'on';
  return (
    <div className={`voice${compact ? ' compact' : ''}`}>
      <button className={`btn voice-btn${micOn ? ' live' : ''}`} aria-pressed={micOn} aria-label={micOn ? 'Mute mic' : 'Turn mic on'} disabled={mic === 'asking'} onClick={toggleMic}>
        <svg {...icon}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          {!micOn && <path d="M4 4l16 16" />}
        </svg>
        {!compact && <span>Mic</span>}
      </button>
      <button className={`btn voice-btn${speaker ? ' live' : ''}`} aria-pressed={speaker} aria-label={speaker ? 'Mute friends' : 'Hear friends'} onClick={toggleSpeaker}>
        <svg {...icon}>
          <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" />
          {speaker ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9l5 6M21 9l-5 6" />}
        </svg>
        {!compact && <span>Speaker</span>}
      </button>
      {!compact && <p className={`net-note${mic === 'denied' ? ' bad' : ''}`} role="status">{MIC_NOTE[mic]}{voiceLinks.total > 0 && ` · Connected to ${voiceLinks.up} of ${voiceLinks.total}`}</p>}
    </div>
  );
}
