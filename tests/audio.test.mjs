import test from 'node:test';
import assert from 'node:assert/strict';
import { SoftAudio, cueSpec } from '../audio.mjs';

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  record(method, value, time) { this.events.push({ method, value, time }); this.value = value; }
  setValueAtTime(value, time) { this.record('set', value, time); }
  linearRampToValueAtTime(value, time) { this.record('linear', value, time); }
  exponentialRampToValueAtTime(value, time) { this.record('exponential', value, time); }
  cancelAndHoldAtTime(time) { this.events.push({ method: 'hold', time }); }
  cancelScheduledValues(time) { this.events.push({ method: 'cancel', time }); }
}

class FakeContext {
  constructor(state = 'suspended') {
    this.state = state; this.currentTime = 10; this.destination = {};
    this.gains = []; this.oscillators = []; this.resumes = 0;
  }
  createGain() {
    const node = { gain: new Param(), disconnected: false, connect() {}, disconnect() { this.disconnected = true; } };
    this.gains.push(node); return node;
  }
  createOscillator() {
    const node = {
      frequency: new Param(), starts: [], stops: [], disconnected: false,
      connect() {}, disconnect() { this.disconnected = true; },
      start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); },
      end() { this.onended?.(); },
    };
    this.oscillators.push(node); return node;
  }
  async resume() { this.resumes++; this.state = 'running'; }
  async close() { this.state = 'closed'; }
}

test('audio is silent until explicitly unlocked and does not construct a context early', async () => {
  let constructions = 0;
  const context = new FakeContext();
  const audio = new SoftAudio({ contextFactory: () => { constructions++; return context; } });
  assert.equal(constructions, 0);
  assert.equal(audio.status, 'locked');
  assert.equal(audio.cue('inhale'), false);
  assert.equal(await audio.unlock(), true);
  assert.equal(constructions, 1);
  assert.equal(context.resumes, 1);
  assert.equal(audio.status, 'ready');
  assert.equal(context.oscillators.length, 0);
  assert.equal(audio.cue('inhale'), true);
});

test('gain stays bounded and mute creates no tones', async () => {
  const context = new FakeContext();
  const audio = new SoftAudio({ contextFactory: () => context });
  assert.equal(audio.setVolume(900), 60);
  await audio.unlock();
  audio.setVolume(30); audio.setVolume(Infinity); audio.setVolume(-4);
  assert.equal(audio.cue('inhale'), false);
  assert.equal(context.oscillators.length, 0);
  audio.setVolume(60); audio.setTone('bell'); audio.cue('inhale');
  for (const event of context.gains[0].gain.events) {
    if ('value' in event) assert.ok(event.value >= 0 && event.value <= 0.12);
  }
  const spec = cueSpec('inhale', 'bell')[0];
  assert.ok(spec.partials.reduce((sum, partial) => sum + partial.weight, 0) <= 1);
  assert.ok(spec.level <= 1);
  for (const gain of context.gains.slice(1)) {
    assert.equal(gain.gain.events.filter(event => event.method === 'set')[0].value, 0);
    assert.equal(gain.gain.events.at(-1).value, 0);
  }
});

test('inhale rises, exhale falls, completion plays two quieter notes, and unknown phases are silent', () => {
  const inhale = cueSpec('inhale')[0]; const exhale = cueSpec('exhale')[0];
  assert.ok(inhale.to > inhale.from); assert.ok(exhale.to < exhale.from);
  const completion = cueSpec('complete');
  assert.equal(completion.length, 2);
  assert.ok(completion[1].offset > completion[0].duration);
  assert.ok(completion.every(note => note.level < inhale.level));
  assert.deepEqual(cueSpec('unknown'), []);
});

test('natural endings disconnect every scheduled oscillator and gain', async () => {
  const context = new FakeContext(); const audio = new SoftAudio({ contextFactory: () => context });
  await audio.unlock(); audio.setTone('bell'); audio.cue('complete');
  assert.equal(context.oscillators.length, 6);
  assert.ok(context.oscillators.every(node => node.stops[0] > node.starts[0]));
  context.oscillators.forEach(node => node.end());
  assert.ok(context.oscillators.every(node => node.disconnected && node.onended === null));
  assert.ok(context.gains.slice(1).every(node => node.disconnected));
  assert.equal(context.gains[0].disconnected, false);
});

test('stop cancels even future notes with a short fade and requires a fresh unlock', async () => {
  const context = new FakeContext(); const audio = new SoftAudio({ contextFactory: () => context });
  await audio.unlock(); audio.cue('complete'); audio.stop();
  assert.equal(audio.ready, false); assert.equal(audio.cue('exhale'), false);
  for (const oscillator of context.oscillators) assert.equal(oscillator.stops.at(-1), 10.025);
  for (const node of context.gains.slice(1)) {
    assert.ok(node.gain.events.some(event => event.method === 'hold'));
    assert.deepEqual(node.gain.events.at(-1), { method: 'linear', value: 0, time: 10.025 });
  }
  const cancellations = context.oscillators.map(node => node.stops.length);
  audio.stop();
  assert.deepEqual(context.oscillators.map(node => node.stops.length), cancellations);
  assert.equal(await audio.unlock(), true);
});

test('replacement cue begins after old tones fade rather than stacking amplitudes', async () => {
  const context = new FakeContext(); const audio = new SoftAudio({ contextFactory: () => context });
  await audio.unlock(); audio.cue('inhale'); context.currentTime = 10.1; audio.cue('exhale');
  assert.ok(context.oscillators[1].starts[0] > context.oscillators[0].stops.at(-1));
  assert.equal(audio.ready, true);
});

test('construction errors and rejected resume are handled; another gesture can retry resume', async () => {
  const failed = new SoftAudio({ contextFactory: () => { throw new Error('unsupported'); } });
  assert.equal(await failed.unlock(), false); assert.equal(failed.available, false);
  assert.equal(failed.status, 'unavailable'); assert.equal(failed.cue('ready'), false);
  const context = new FakeContext(); const audio = new SoftAudio({ contextFactory: () => context });
  context.resume = async () => { throw new Error('blocked'); };
  assert.equal(await audio.unlock(), false); assert.equal(audio.status, 'suspended');
  assert.equal(audio.cue('inhale'), false);
  context.resume = async () => { context.state = 'running'; };
  assert.equal(await audio.unlock(), true);
});

test('stop invalidates an in-flight unlock and never queues a delayed cue', async () => {
  let finish;
  const context = new FakeContext();
  context.resume = () => new Promise(resolve => { finish = () => { context.state = 'running'; resolve(); }; });
  const audio = new SoftAudio({ contextFactory: () => context });
  const pending = audio.unlock(); audio.stop(); finish();
  assert.equal(await pending, false); assert.equal(audio.ready, false);
  assert.equal(audio.cue('inhale'), false); assert.equal(context.oscillators.length, 0);
});

test('a superseded unlock cannot overwrite the result of the newer gesture', async () => {
  const finishes = [];
  const context = new FakeContext();
  context.resume = () => new Promise(resolve => finishes.push(() => { context.state = 'running'; resolve(); }));
  const audio = new SoftAudio({ contextFactory: () => context });
  const old = audio.unlock(); const current = audio.unlock();
  finishes[1](); assert.equal(await current, true);
  finishes[0](); assert.equal(await old, false); assert.equal(audio.ready, true);
});

test('external suspension suppresses cues; stop cleans suspended resources and dispose is safe', async () => {
  const context = new FakeContext(); const audio = new SoftAudio({ contextFactory: () => context });
  await audio.unlock(); audio.cue('inhale'); context.state = 'suspended';
  assert.equal(audio.ready, false); assert.equal(audio.status, 'suspended');
  assert.equal(audio.cue('exhale'), false); audio.stop();
  assert.ok(context.oscillators.every(node => node.disconnected));
  await audio.dispose(); await audio.dispose();
  assert.equal(context.gains[0].disconnected, true);
  assert.equal(audio.status, 'disposed'); assert.equal(await audio.unlock(), false);
});

test('legacy AudioParam fallback cancels automation before ramping without negative gains', async () => {
  const context = new FakeContext(); const audio = new SoftAudio({ contextFactory: () => context });
  await audio.unlock(); audio.cue('inhale');
  const param = context.gains[1].gain;
  param.cancelAndHoldAtTime = undefined; param.value = -100;
  audio.stop();
  assert.deepEqual(param.events.slice(-3), [
    { method: 'cancel', time: 10 }, { method: 'set', value: 0, time: 10 },
    { method: 'linear', value: 0, time: 10.025 },
  ]);
});
