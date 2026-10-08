/** Best-effort screen wake lock. The session controller owns when to acquire it. */
export class StayAwake {
  constructor({ requester, isVisible } = {}) {
    const wakeLock = globalThis.navigator?.wakeLock;
    this._request = requester === undefined
      ? (typeof wakeLock?.request === 'function' ? wakeLock.request.bind(wakeLock) : null)
      : (typeof requester === 'function' ? requester : null);
    this._visible = typeof isVisible === 'function'
      ? isVisible : () => globalThis.document?.visibilityState === 'visible';
    this._epoch = 0;
    this._pending = null;
    this._sentinel = null;
    this._listener = null;
  }

  get available() { return this._request !== null; }
  get active() { return Boolean(this._sentinel && !this._sentinel.released); }

  async acquire() {
    if (!this.available || !this._isVisible()) return false;
    if (this.active) return true;
    if (this._pending) return this._pending.promise;
    this._forget();
    const operation = { epoch: ++this._epoch, promise: null };
    this._pending = operation;
    operation.promise = this._acquire(operation);
    return operation.promise;
  }

  async release() {
    ++this._epoch;
    // A later start can request a fresh lock while an older request is pending.
    // The older request still checks its epoch and releases its own late result.
    this._pending = null;
    const sentinel = this._sentinel;
    this._forget();
    await this._release(sentinel);
  }

  async _acquire(operation) {
    let sentinel;
    try {
      sentinel = await this._request('screen');
      if (!sentinel || typeof sentinel.release !== 'function' || sentinel.released
        || operation.epoch !== this._epoch || !this._isVisible()) {
        await this._release(sentinel);
        return false;
      }
      const onRelease = () => {
        if (this._sentinel === sentinel) this._forget();
      };
      sentinel.addEventListener?.('release', onRelease, { once: true });
      this._sentinel = sentinel;
      this._listener = onRelease;
      return true;
    } catch {
      // Policy, battery, visibility and platform refusals are ordinary outcomes.
      await this._release(sentinel);
      return false;
    } finally {
      if (this._pending === operation) this._pending = null;
    }
  }

  _isVisible() {
    try { return this._visible() === true; } catch { return false; }
  }

  _forget() {
    try { this._sentinel?.removeEventListener?.('release', this._listener); } catch { /* Best effort. */ }
    this._sentinel = null;
    this._listener = null;
  }

  async _release(sentinel) {
    try {
      if (sentinel && !sentinel.released && typeof sentinel.release === 'function') await sentinel.release();
    } catch { /* A revoked or interrupted lock must not affect the exercise. */ }
  }
}
