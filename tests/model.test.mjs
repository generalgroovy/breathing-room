import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, DEFAULTS, normalizeSettings, createPlan, frameAt, restartCycleAt, formatTime } from '../model.mjs';

test('safe defaults are independent settings objects', () => {
  assert.deepEqual(normalizeSettings(), DEFAULTS);
  const changed = normalizeSettings();
  changed.inhale = 9;
  assert.equal(normalizeSettings().inhale, 4);
  assert.ok(Object.isFrozen(DEFAULTS));
  assert.ok(PRESETS.every(Object.isFrozen));
});

test('named presets supply missing durations and names follow actual timings', () => {
  for (const preset of PRESETS) {
    const settings = normalizeSettings({ preset: preset.id });
    for (const key of ['inhale', 'holdIn', 'exhale', 'holdOut']) assert.equal(settings[key], preset[key]);
    assert.equal(settings.preset, preset.id);
  }
  assert.equal(normalizeSettings({ preset: 'gentle', exhale: 4 }).preset, 'even');
  assert.equal(normalizeSettings({ preset: 'box', holdIn: 0, holdOut: 0 }).preset, 'even');
  assert.equal(normalizeSettings({ inhale: 7 }).preset, 'custom');
  assert.equal(normalizeSettings({ preset: 'unknown' }).preset, 'gentle');
});

test('numeric controls are bounded and rounded without coercing strings', () => {
  const settings = normalizeSettings({ inhale: -9, holdIn: 99, exhale: 90, holdOut: -2, minutes: 40, volume: 80 });
  assert.deepEqual([settings.inhale, settings.holdIn, settings.exhale, settings.holdOut, settings.minutes, settings.volume], [2, 4, 10, 0, 20, 60]);
  assert.equal(normalizeSettings({ minutes: 0 }).minutes, 1);
  assert.equal(normalizeSettings({ volume: -9 }).volume, 0);
  assert.equal(normalizeSettings({ inhale: 2.8 }).inhale, 3);
  assert.equal(normalizeSettings({ inhale: '7' }).inhale, 4);
  assert.equal(normalizeSettings({ volume: null }).volume, 25);
  assert.equal(normalizeSettings({ minutes: false }).minutes, 3);
});

test('boolean, cue and motion choices only accept explicit supported values', () => {
  const settings = normalizeSettings({ sound: false, volume: 0, cue: 'soft', motion: 'still' });
  assert.deepEqual([settings.sound, settings.volume, settings.cue, settings.motion], [false, 0, 'soft', 'still']);
  assert.equal(normalizeSettings({ sound: 'false' }).sound, true);
  assert.equal(normalizeSettings({ sound: 0 }).sound, true);
  assert.equal(normalizeSettings({ cue: '<script>', motion: 'fast' }).cue, 'bell');
  assert.equal(normalizeSettings({ cue: '<script>', motion: 'fast' }).motion, 'auto');
});

test('saved settings JSON round trips, including silent preferences', () => {
  const settings = normalizeSettings({ inhale: 3, holdIn: 1, exhale: 8, holdOut: 2, minutes: 7, sound: false, volume: 0, cue: 'soft', motion: 'still' });
  assert.deepEqual(normalizeSettings(JSON.stringify(settings)), settings);
  assert.deepEqual(normalizeSettings(JSON.stringify({ preset: 'box' })), normalizeSettings({ preset: 'box' }));
  assert.equal(normalizeSettings('{"preset":"even","unrelated":"ignored"}').preset, 'even');
});

test('damaged storage, unsupported types and unsafe properties cannot break defaults', () => {
  const corrupt = [null, undefined, '', '{broken', '[1,2]', 'null', 'true', '42', 3, true, [], new Date(), Symbol('bad'), () => {}, ' '.repeat(4097)];
  for (const value of corrupt) assert.deepEqual(normalizeSettings(value), DEFAULTS);
  const poisoned = Object.defineProperty({}, 'inhale', { get() { throw new Error('broken storage wrapper'); } });
  assert.deepEqual(normalizeSettings(poisoned), DEFAULTS);
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  assert.deepEqual(normalizeSettings(revocable.proxy), DEFAULTS);
  const nullPrototype = Object.assign(Object.create(null), { preset: 'even' });
  assert.equal(normalizeSettings(nullPrototype).preset, 'even');
  assert.deepEqual(normalizeSettings('{"__proto__":{"inhale":10},"constructor":7}'), DEFAULTS);
  assert.equal({}.inhale, undefined);
});

test('nonfinite controls fall back to safe settings and produce no invalid timings', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const settings = normalizeSettings({ inhale: value, holdIn: value, exhale: value, holdOut: value, minutes: value, volume: value });
    assert.deepEqual(settings, DEFAULTS);
    const plan = createPlan(settings);
    assert.ok(Number.isFinite(plan.durationMs));
    assert.ok(plan.durationMs > 0);
  }
});

test('zero holds are omitted and phase boundaries share a continuous cycle', () => {
  const plan = createPlan();
  assert.deepEqual(plan.phases, [
    { id: 'inhale', label: 'Breathe in', seconds: 4, startMs: 0, endMs: 4000 },
    { id: 'exhale', label: 'Breathe out', seconds: 6, startMs: 4000, endMs: 10000 },
  ]);
  assert.equal(plan.cycleMs, 10000);
  assert.equal(plan.cycles, 18);
  assert.equal(plan.durationMs, 180000);
  assert.equal(plan.requestedMs, 180000);
});

test('every session ends on a whole cycle at or after its requested duration', () => {
  for (const preset of PRESETS) {
    for (let minutes = 1; minutes <= 20; minutes += 1) {
      const plan = createPlan({ preset: preset.id, minutes });
      assert.equal(plan.durationMs % plan.cycleMs, 0);
      assert.ok(plan.durationMs >= plan.requestedMs);
      assert.ok(plan.durationMs - plan.requestedMs < plan.cycleMs);
      assert.equal(plan.cycles, plan.durationMs / plan.cycleMs);
    }
  }
  assert.equal(createPlan({ preset: 'even' }).durationMs, 184000);
  assert.equal(createPlan({ preset: 'box' }).durationMs, 192000);
});

test('inhale and exhale expansion are continuous and exact at phase boundaries', () => {
  const plan = createPlan();
  const cases = [
    [0, 'inhale', 0, 4000, 1], [2000, 'inhale', 0.5, 2000, 1],
    [4000, 'exhale', 1, 6000, 1], [7000, 'exhale', 0.5, 3000, 1],
    [10000, 'inhale', 0, 4000, 2],
  ];
  for (const [elapsed, phase, expansion, phaseRemaining, cycle] of cases) {
    const frame = frameAt(plan, elapsed);
    assert.equal(frame.phaseId, phase);
    assert.equal(frame.expansion, expansion);
    assert.equal(frame.phaseRemainingMs, phaseRemaining);
    assert.equal(frame.cycleNumber, cycle);
    assert.equal(frame.completedCycles, cycle - 1);
    assert.equal(frame.remainingMs, plan.durationMs - elapsed);
    assert.equal(frame.complete, false);
  }
  assert.equal(frameAt(plan, 3999).phaseId, 'inhale');
  assert.equal(frameAt(plan, 9999).phaseId, 'exhale');
});

test('hold phases keep their appropriate expansion and end on exact boundaries', () => {
  const plan = createPlan({ preset: 'box' });
  assert.deepEqual(plan.phases.map(phase => phase.id), ['inhale', 'holdIn', 'exhale', 'holdOut']);
  for (const [elapsed, phase, expansion] of [[4000, 'holdIn', 1], [7999, 'holdIn', 1], [8000, 'exhale', 1], [12000, 'holdOut', 0], [15999, 'holdOut', 0], [16000, 'inhale', 0]]) {
    const frame = frameAt(plan, elapsed);
    assert.equal(frame.phaseId, phase);
    assert.equal(frame.expansion, expansion);
  }
  assert.equal(frameAt(plan, 4000).label, 'Hold gently');
  assert.equal(frameAt(plan, 12000).label, 'Rest gently');
});

test('large elapsed jumps resolve directly instead of drifting through missed phases', () => {
  const plan = createPlan({ preset: 'box', minutes: 20 });
  const frame = frameAt(plan, 970000);
  assert.equal(frame.completedCycles, 60);
  assert.equal(frame.cycleNumber, 61);
  assert.equal(frame.phaseId, 'exhale');
  assert.equal(frame.phaseProgress, 0.5);
  assert.equal(frame.expansion, 0.5);
  assert.equal(frame.phaseRemainingMs, 2000);
});

test('completion is capped, calm and identical after arbitrarily late frames', () => {
  const plan = createPlan({ preset: 'even', minutes: 1 });
  const end = frameAt(plan, plan.durationMs);
  assert.deepEqual(end, {
    complete: true, phaseId: null, label: 'Breathe naturally', phaseIndex: -1,
    phaseProgress: 1, phaseRemainingMs: 0, remainingMs: 0, elapsedMs: plan.durationMs,
    cycleNumber: plan.cycles, completedCycles: plan.cycles, expansion: 0,
  });
  assert.deepEqual(frameAt(plan, Number.MAX_VALUE), end);
  assert.deepEqual(frameAt(plan, Infinity), end);
  assert.equal(frameAt(plan, plan.durationMs - 1).phaseId, 'exhale');
  assert.equal(frameAt(plan, plan.durationMs - 1).complete, false);
});

test('invalid, negative and nonfinite elapsed input is clamped without coercion', () => {
  const plan = createPlan();
  const start = frameAt(plan, 0);
  for (const elapsed of [undefined, null, '4000', -1, -Infinity, NaN, {}, Symbol('time')]) {
    assert.deepEqual(frameAt(plan, elapsed), start);
    assert.equal(restartCycleAt(plan, elapsed), 0);
  }
  assert.equal(frameAt(plan, 1250.5).elapsedMs, 1250.5);
});

test('resume rewinds any partial phase to the current whole breath, never a partial hold', () => {
  const plan = createPlan({ preset: 'box' });
  for (const [elapsed, restart] of [[0, 0], [1, 0], [7999, 0], [15999, 0], [16000, 16000], [27999, 16000], [plan.durationMs - 1, plan.durationMs - plan.cycleMs]]) {
    assert.equal(restartCycleAt(plan, elapsed), restart);
    assert.equal(frameAt(plan, restart).phaseId, 'inhale');
    assert.equal(frameAt(plan, restart).phaseProgress, 0);
  }
  assert.equal(restartCycleAt(plan, plan.durationMs), plan.durationMs);
  assert.equal(restartCycleAt(plan, Infinity), plan.durationMs);
});

test('frame invariants hold for short, long, asymmetric and single-hold cycles', () => {
  for (const settings of [
    { inhale: 2, exhale: 2, holdIn: 0, holdOut: 0, minutes: 1 },
    { inhale: 10, exhale: 10, holdIn: 4, holdOut: 4, minutes: 20 },
    { inhale: 3, exhale: 7, holdIn: 2, holdOut: 0, minutes: 2 },
    { inhale: 2, exhale: 9, holdIn: 0, holdOut: 3, minutes: 3 },
  ]) {
    const plan = createPlan(settings);
    for (let elapsed = 0; elapsed < plan.durationMs; elapsed += 137.25) {
      const frame = frameAt(plan, elapsed);
      for (const key of ['phaseProgress', 'phaseRemainingMs', 'remainingMs', 'elapsedMs', 'cycleNumber', 'completedCycles', 'expansion']) assert.ok(Number.isFinite(frame[key]), key);
      assert.ok(frame.phaseProgress >= 0 && frame.phaseProgress < 1);
      assert.ok(frame.expansion >= 0 && frame.expansion <= 1);
      assert.ok(frame.phaseRemainingMs > 0);
      assert.ok(frame.remainingMs > 0);
      assert.ok(frame.phaseIndex >= 0 && frame.phaseIndex < plan.phases.length);
      assert.ok(frame.cycleNumber >= 1 && frame.cycleNumber <= plan.cycles);
      assert.equal(frame.complete, false);
    }
  }
});

test('display time rounds remaining fractions up and never shows a negative time', () => {
  for (const [milliseconds, expected] of [[0, '00:00'], [1, '00:01'], [999, '00:01'], [1000, '00:01'], [1001, '00:02'], [59999, '01:00'], [60000, '01:00'], [60001, '01:01'], [1200000, '20:00'], [-1, '00:00'], [Infinity, '00:00'], [NaN, '00:00'], ['1000', '00:00']]) {
    assert.equal(formatTime(milliseconds), expected);
  }
});
