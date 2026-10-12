/**
 * The lecture timeline clock. It only advances while recording, so its readings line up with
 * positions in the recorded audio (pauses are not recorded).
 */
export class SessionClock {
  private baseMs = 0;
  private runningSince: number | null = null;

  /** Positions the clock at `fromMs`, paused. */
  reset(fromMs: number): void {
    this.baseMs = fromMs;
    this.runningSince = null;
  }

  resume(): void {
    if (this.runningSince === null) this.runningSince = performance.now();
  }

  pause(): void {
    if (this.runningSince !== null) {
      this.baseMs += performance.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  get running(): boolean {
    return this.runningSince !== null;
  }

  now(): number {
    return this.baseMs + (this.runningSince === null ? 0 : performance.now() - this.runningSince);
  }
}
