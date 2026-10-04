const KEEP = 8;

type Sample = { rtt: number; offset: number };

/** Estimates the server clock from ping round trips; the lowest-RTT recent sample is the most trustworthy. */
export class ClockSync {
  private samples: Sample[] = [];
  private bestSample: Sample | undefined;

  /** Client times come from performance.now(); serverTime is the server's Date.now(). */
  addSample(sentAt: number, serverTime: number, receivedAt: number) {
    this.samples.push({ rtt: receivedAt - sentAt, offset: serverTime - (sentAt + receivedAt) / 2 });
    if (this.samples.length > KEEP) this.samples.shift();
    // serverNow runs every frame, so pick the best sample once per ping, not per call.
    this.bestSample = this.samples.reduce<Sample | undefined>((a, s) => (!a || s.rtt < a.rtt ? s : a), undefined);
  }

  get offset() {
    return this.bestSample?.offset ?? 0;
  }

  get rtt() {
    return this.bestSample?.rtt ?? 0;
  }

  get synced() {
    return this.samples.length > 0;
  }

  serverNow(clientNow = performance.now()) {
    return clientNow + this.offset;
  }
}
