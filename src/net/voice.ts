// Voice chat for friends' rooms: one WebRTC audio link to every other player, set up through the room server.
// The server only passes the setup messages along; the audio goes phone to phone.
import type { RtcSignal } from './protocol';

export type MicState = 'off' | 'asking' | 'on' | 'denied' | 'unsupported';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
// The room server drops a socket's messages beyond 30 a second: trickle candidates out slower than that.
const SEND_GAP_MS = 60;
const RETRY_MS = 3000;

type Peer = {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  /** Candidates that arrived before the remote description did. */
  early: RTCIceCandidateInit[];
  remoteSet: boolean;
};

export const voiceSupported = () =>
  typeof RTCPeerConnection !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export class VoiceChat {
  private peers = new Map<number, Peer>();
  private track: MediaStreamTrack | null = null;
  private speakerOn = true;
  private mySlot = 0;
  private others: number[] = [];
  private outbox: Array<() => void> = [];
  private outTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  mic: MicState = voiceSupported() ? 'off' : 'unsupported';

  constructor(
    private send: (to: number, signal: RtcSignal) => void,
    private changed: () => void,
  ) {}

  get speaker() {
    return this.speakerOn;
  }

  async enableMic() {
    if (this.mic === 'unsupported' || this.mic === 'on' || this.mic === 'asking') return;
    this.mic = 'asking';
    this.changed();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.closed) return stream.getTracks().forEach(t => t.stop());
      this.track = stream.getAudioTracks()[0] ?? null;
      this.mic = this.track ? 'on' : 'denied';
      // The mic dying (unplugged, taken by a call) is the same as switching it off.
      this.track?.addEventListener('ended', () => { if (this.mic === 'on') this.disableMic(); });
      for (const p of this.peers.values()) this.attach(p);
    } catch {
      this.mic = 'denied';
    }
    this.changed();
  }

  disableMic() {
    this.track?.stop();
    this.track = null;
    if (this.mic === 'on' || this.mic === 'asking') this.mic = 'off';
    for (const p of this.peers.values()) this.attach(p);
    this.changed();
  }

  setSpeaker(on: boolean) {
    this.speakerOn = on;
    for (const p of this.peers.values()) {
      p.audio.muted = !on;
      if (on) void p.audio.play().catch(() => undefined);
    }
    this.changed();
  }

  /** The connected players besides us: links open to the new ones and close to the ones that went. */
  sync(mySlot: number, others: number[]) {
    if (this.closed || !voiceSupported()) return;
    this.mySlot = mySlot;
    this.others = others;
    for (const slot of [...this.peers.keys()]) if (!others.includes(slot)) this.drop(slot);
    // The lower slot makes the offer, so two phones never offer to each other at once.
    for (const slot of others) if (!this.peers.has(slot) && mySlot < slot) void this.offer(slot);
  }

  async onSignal(from: number, signal: RtcSignal) {
    if (this.closed || !voiceSupported() || from === this.mySlot) return;
    try {
      if (signal.kind === 'offer') {
        // A fresh offer means the other end started over: so do we.
        this.drop(from);
        const peer = this.open(from);
        // Created by the offer, a transceiver would only receive: let it send too once the mic is on.
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
        peer.remoteSet = true;
        for (const t of peer.pc.getTransceivers()) t.direction = 'sendrecv';
        this.attach(peer);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        this.flushEarly(peer);
        this.queue(() => this.send(from, { kind: 'answer', sdp: peer.pc.localDescription?.sdp ?? '' }));
      } else if (signal.kind === 'answer') {
        const peer = this.peers.get(from);
        if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        peer.remoteSet = true;
        this.flushEarly(peer);
      } else {
        const peer = this.peers.get(from);
        if (!peer) return;
        const init = { candidate: signal.candidate, sdpMid: signal.mid, sdpMLineIndex: signal.index };
        if (peer.remoteSet) await peer.pc.addIceCandidate(init);
        else peer.early.push(init);
      }
    } catch {
      // A bad or stale message: this link just does not come up, the rest carry on.
    }
  }

  close() {
    this.closed = true;
    for (const slot of [...this.peers.keys()]) this.drop(slot);
    this.track?.stop();
    this.track = null;
    if (this.outTimer) clearTimeout(this.outTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.outbox = [];
  }

  private async offer(to: number) {
    const peer = this.open(to);
    peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
    this.attach(peer);
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      this.queue(() => this.send(to, { kind: 'offer', sdp: peer.pc.localDescription?.sdp ?? '' }));
    } catch {
      this.drop(to);
    }
  }

  private open(slot: number): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.muted = !this.speakerOn;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    const peer: Peer = { pc, audio, early: [], remoteSet: false };
    this.peers.set(slot, peer);
    pc.onicecandidate = e => {
      if (!e.candidate) return;
      const c = e.candidate;
      this.queue(() => this.send(slot, { kind: 'ice', candidate: c.candidate, mid: c.sdpMid, index: c.sdpMLineIndex }));
    };
    pc.ontrack = e => {
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void audio.play().catch(() => undefined);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== 'failed' || this.peers.get(slot) !== peer) return;
      this.drop(slot);
      this.retryLater();
    };
    return peer;
  }

  /** Puts the current mic (or silence) on this link; no renegotiation needed. */
  private attach(peer: Peer) {
    for (const t of peer.pc.getTransceivers()) void t.sender.replaceTrack(this.track).catch(() => undefined);
  }

  private flushEarly(peer: Peer) {
    for (const init of peer.early.splice(0)) void peer.pc.addIceCandidate(init).catch(() => undefined);
  }

  private drop(slot: number) {
    const peer = this.peers.get(slot);
    if (!peer) return;
    this.peers.delete(slot);
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
  }

  private retryLater() {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.sync(this.mySlot, this.others);
    }, RETRY_MS);
  }

  private queue(fn: () => void) {
    this.outbox.push(fn);
    if (this.outTimer) return;
    // Always leave a gap after a send, so a burst of candidates stays under the server's rate limit.
    const next = () => {
      const fn = this.outbox.shift();
      if (!fn) {
        this.outTimer = null;
        return;
      }
      fn();
      this.outTimer = setTimeout(next, SEND_GAP_MS);
    };
    next();
  }
}
