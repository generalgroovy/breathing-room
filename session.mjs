import { createPlan, frameAt, restartCycleAt } from './model.mjs';

const READY_MS = 3000;
const MAX_OBSERVED_GAP_MS = 2000;

/** A breathing clock driven by caller-supplied monotonic timestamps. */
export class SessionClock {
  constructor(plan = createPlan()) {
    this.reset(plan);
  }

  reset(plan = this.plan) {
    this.plan = plan;
    this.status = 'idle';
    this.elapsedMs = 0;
    this.readyAt = 0;
    this.lastTick = 0;
    this.interrupted = false;
    this.completedNaturally = false;
    this._baseElapsedMs = 0;
    return this.snapshot();
  }

  _time(now) {
    return typeof now === 'number' && Number.isFinite(now)
      ? Math.max(this.lastTick, now, 0) : this.lastTick;
  }

  prepare(now) {
    if (this.status === 'preparing' || this.status === 'running') return this.snapshot();
    const time = this._time(now);
    this.elapsedMs = this.status === 'paused' ? restartCycleAt(this.plan, this.elapsedMs) : 0;
    this._baseElapsedMs = this.elapsedMs;
    this.readyAt = time + READY_MS;
    this.lastTick = time;
    this.status = 'preparing';
    this.interrupted = false;
    this.completedNaturally = false;
    return this.snapshot();
  }

  tick(now) {
    const time = this._time(now);
    const gap = time - this.lastTick;
    if (this.status !== 'preparing' && this.status !== 'running') return this.snapshot();

    this.lastTick = time;
    if (gap > MAX_OBSERVED_GAP_MS) {
      // A suspended page cannot reliably guide the missing breaths. Resume
      // starts a fresh inhale instead of jumping the person into a hold.
      this.status = 'paused';
      this.readyAt = 0;
      this.interrupted = true;
      return this.snapshot();
    }

    if (this.status === 'preparing') {
      if (time < this.readyAt) return this.snapshot();
      this.status = 'running';
      this.elapsedMs = this._baseElapsedMs + time - this.readyAt;
      this.readyAt = 0;
    } else {
      this.elapsedMs += gap;
    }

    if (this.elapsedMs >= this.plan.durationMs) {
      this.elapsedMs = this.plan.durationMs;
      this.status = 'complete';
      this.completedNaturally = true;
    }
    return this.snapshot();
  }

  pause(now) {
    if (this.status !== 'preparing' && this.status !== 'running') return this.snapshot();
    if (this.status === 'preparing') {
      const time = this._time(now);
      this.interrupted = time - this.lastTick > MAX_OBSERVED_GAP_MS;
      this.lastTick = time;
      this.status = 'paused';
      this.readyAt = 0;
      return this.snapshot();
    }
    this.tick(now);
    if (this.status !== 'complete') {
      this.status = 'paused';
      this.readyAt = 0;
    }
    return this.snapshot();
  }

  finish(now) {
    if (this.status === 'complete') return this.snapshot();
    this.tick(now);
    this.status = 'complete';
    this.readyAt = 0;
    this.interrupted = false;
    this.completedNaturally = false;
    return this.snapshot();
  }

  snapshot(now = this.lastTick) {
    const time = this._time(now);
    return {
      status: this.status,
      elapsedMs: this.elapsedMs,
      readyRemainingMs: this.status === 'preparing' ? Math.max(0, this.readyAt - time) : 0,
      frame: frameAt(this.plan, this.elapsedMs),
      interrupted: this.interrupted,
      completedNaturally: this.completedNaturally,
    };
  }
}
