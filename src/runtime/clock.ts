/** Fixed clock. Bound catch-up after background tabs without changing physics dt. */
export class FixedClock {
  readonly step = 1 / 60;
  tick = 0;
  private accumulator = 0;
  advance(elapsed: number, paused: boolean): number {
    if (paused) { this.accumulator = 0; return 0; }
    this.accumulator += Math.min(Math.max(elapsed, 0), .05);
    const steps = Math.min(3, Math.floor((this.accumulator + 1e-9) / this.step));
    this.accumulator -= steps * this.step;
    return steps;
  }
  reset() { this.tick = 0; this.accumulator = 0; }
}
