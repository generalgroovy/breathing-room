import test from 'node:test';
import assert from 'node:assert/strict';
import { StayAwake } from '../screen.mjs';

class Sentinel extends EventTarget {
  released = false;
  releaseCalls = 0;
  async release() {
    this.releaseCalls++;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
  revoke() {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

test('screen requests are explicit and repeated acquisitions hold only one sentinel', async () => {
  let calls = 0;
  const sentinel = new Sentinel();
  const awake = new StayAwake({ requester: async type => { calls++; assert.equal(type, 'screen'); return sentinel; }, isVisible: () => true });
  assert.equal(calls, 0); assert.equal(awake.available, true); assert.equal(awake.active, false);
  assert.equal(await awake.acquire(), true); assert.equal(await awake.acquire(), true);
  assert.equal(calls, 1); assert.equal(awake.active, true);
  await awake.release(); await awake.release();
  assert.equal(awake.active, false); assert.equal(sentinel.releaseCalls, 1);
});

test('unsupported or hidden pages quietly decline without asking the browser', async () => {
  const unsupported = new StayAwake({ requester: null, isVisible: () => true });
  assert.equal(unsupported.available, false); assert.equal(await unsupported.acquire(), false);
  await unsupported.release();
  let requests = 0;
  const hidden = new StayAwake({ requester: () => { requests++; }, isVisible: () => false });
  assert.equal(await hidden.acquire(), false); assert.equal(requests, 0);
  const brokenVisibility = new StayAwake({ requester: () => { requests++; }, isVisible: () => { throw new Error('unavailable'); } });
  assert.equal(await brokenVisibility.acquire(), false); assert.equal(requests, 0);
});

test('concurrent acquisition shares one pending request', async () => {
  let finish; let calls = 0;
  const awake = new StayAwake({ requester: () => { calls++; return new Promise(resolve => { finish = resolve; }); }, isVisible: () => true });
  const first = awake.acquire(); const second = awake.acquire();
  assert.equal(calls, 1);
  finish(new Sentinel());
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  await awake.release();
});

test('release invalidates pending acquisition and releases a late sentinel', async () => {
  let finish;
  const awake = new StayAwake({ requester: () => new Promise(resolve => { finish = resolve; }), isVisible: () => true });
  const pending = awake.acquire(); await awake.release();
  const sentinel = new Sentinel(); finish(sentinel);
  assert.equal(await pending, false); assert.equal(awake.active, false);
  assert.equal(sentinel.releaseCalls, 1);
});

test('a stale request cannot replace or clear a newer acquired lock', async () => {
  const finishes = [];
  const awake = new StayAwake({ requester: () => new Promise(resolve => finishes.push(resolve)), isVisible: () => true });
  const oldRequest = awake.acquire(); await awake.release(); const newRequest = awake.acquire();
  const current = new Sentinel(); finishes[1](current);
  assert.equal(await newRequest, true);
  const old = new Sentinel(); finishes[0](old);
  assert.equal(await oldRequest, false); assert.equal(old.releaseCalls, 1);
  assert.equal(awake.active, true); assert.equal(current.releaseCalls, 0);
  await awake.release(); assert.equal(current.releaseCalls, 1);
});

test('an old completion does not erase a newer pending request', async () => {
  const finishes = [];
  const awake = new StayAwake({ requester: () => new Promise(resolve => finishes.push(resolve)), isVisible: () => true });
  const oldRequest = awake.acquire(); await awake.release(); const current = awake.acquire();
  finishes[0](new Sentinel()); assert.equal(await oldRequest, false);
  const repeated = awake.acquire(); assert.equal(finishes.length, 2);
  finishes[1](new Sentinel());
  assert.deepEqual(await Promise.all([current, repeated]), [true, true]);
  await awake.release();
});

test('becoming hidden during acquisition releases the result without claiming success', async () => {
  let visible = true; let finish;
  const awake = new StayAwake({ requester: () => new Promise(resolve => { finish = resolve; }), isVisible: () => visible });
  const pending = awake.acquire(); visible = false;
  const sentinel = new Sentinel(); finish(sentinel);
  assert.equal(await pending, false); assert.equal(sentinel.releaseCalls, 1); assert.equal(awake.active, false);
});

test('external revocation never reacquires until an explicit later request', async () => {
  const sentinels = [];
  const awake = new StayAwake({ requester: async () => { const sentinel = new Sentinel(); sentinels.push(sentinel); return sentinel; }, isVisible: () => true });
  assert.equal(await awake.acquire(), true); sentinels[0].revoke();
  assert.equal(awake.active, false); await Promise.resolve(); assert.equal(sentinels.length, 1);
  assert.equal(await awake.acquire(), true); assert.equal(sentinels.length, 2);
  sentinels[0].dispatchEvent(new Event('release'));
  assert.equal(awake.active, true);
  await awake.release();
});

test('request rejection or synchronous failure is silent and allows later retries', async () => {
  let calls = 0;
  const awake = new StayAwake({ requester: () => {
    calls++;
    if (calls === 1) throw new Error('unsupported');
    if (calls === 2) return Promise.reject(new Error('low battery'));
    return Promise.resolve(new Sentinel());
  }, isVisible: () => true });
  assert.equal(await awake.acquire(), false);
  assert.equal(await awake.acquire(), false);
  assert.equal(await awake.acquire(), true);
  await awake.release();
});

test('release rejection and already-released results cannot escape as unhandled failures', async () => {
  const sentinel = new Sentinel();
  sentinel.release = async () => { throw new Error('platform interrupted'); };
  const awake = new StayAwake({ requester: async () => sentinel, isVisible: () => true });
  assert.equal(await awake.acquire(), true);
  await awake.release(); assert.equal(awake.active, false);
  const released = new Sentinel(); released.revoke();
  const ended = new StayAwake({ requester: async () => released, isVisible: () => true });
  assert.equal(await ended.acquire(), false); assert.equal(ended.active, false);
});
