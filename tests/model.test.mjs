import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, DEFAULTS, normalizeSettings, createPlan, frameAt, restartCycleAt, formatTime } from '../model.mjs';

test('safe defaults are independent settings objects', () => {
  assert.deepEqual(normalizeSettings(), DEFAULTS);
  const changed = normalizeSettings();
  changed.inhale = 9;
  assert.equal(normalizeSettings().inhale, 3);
  assert.equal(DEFAULTS.preset, 'easy');
  assert.equal(DEFAULTS.minutes, 1);
  assert.equal(DEFAULTS.pacing, 'guided');
  assert.equal(DEFAULTS.showSeconds, false);
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
  assert.equal(normalizeSettings({ preset: 'unknown' }).preset, 'easy');
});

test('numeric controls are bounded and rounded without coercing strings', () => {
  const settings = normalizeSettings({ inhale: -9, holdIn: 99, exhale: 90, holdOut: -2, minutes: 40, volume: 80 });
  assert.deepEqual([settings.inhale, settings.holdIn, settings.exhale, settings.holdOut, settings.minutes, settings.volume], [2, 4, 6, 0, 20, 60]);
  assert.equal(normalizeSettings({ minutes: 0 }).minutes, 1);
  assert.equal(normalizeSettings({ volume: -9 }).volume, 0);
  assert.equal(normalizeSettings({ inhale: 2.8 }).inhale, 3);
  assert.equal(normalizeSettings({ inhale: '7' }).inhale, 3);
  assert.equal(normalizeSettings({ volume: null }).volume, 25);
  assert.equal(normalizeSettings({ minutes: false }).minutes, 1);
});

test('boolean, cue, pacing and display choices only accept explicit supported values', () => {
  const settings = normalizeSettings({ sound: false, volume: 0, cue: 'soft', motion: 'still', pacing: 'own', showSeconds: true });
  assert.deepEqual([settings.sound, settings.volume, settings.cue, settings.motion], [false, 0, 'soft', 'still']);
  assert.equal(normalizeSettings({ sound: 'false' }).sound, true);
  assert.equal(normalizeSettings({ sound: 0 }).sound, true);
  assert.equal(normalizeSettings({ cue: '<script>', motion: 'fast' }).cue, 'bell');
  assert.equal(normalizeSettings({ cue: '<script>', motion: 'fast' }).motion, 'auto');
  assert.equal(settings.pacing, 'own');
  assert.equal(settings.showSeconds, true);
  assert.equal(normalizeSettings({ pacing: 'automatic' }).pacing, 'guided');
  for (const showSeconds of ['true', 1, null, {}, undefined]) assert.equal(normalizeSettings({ showSeconds }).showSeconds, false);
});

test('saved settings JSON round trips, including silent preferences', () => {
  const settings = normalizeSettings({ inhale: 3, holdIn: 1, exhale: 6, holdOut: 2, minutes: 7, sound: false, volume: 0, cue: 'soft', motion: 'still', pacing: 'own', showSeconds: true });
  assert.deepEqual(normalizeSettings(JSON.stringify(settings)), settings);
  assert.deepEqual(normalizeSettings(JSON.stringify({ preset: 'box' })), normalizeSettings({ preset: 'box' }));
  assert.equal(normalizeSettings('{"preset":"even","unrelated":"ignored"}').preset, 'even');
});

test('older settings keep supported preferences while timings adopt current product bounds', () => {
  const old = JSON.stringify({ preset: 'custom', inhale: 10, exhale: 9, holdIn: 4, holdOut: 3, minutes: 7, sound: false, volume: 0, cue: 'soft', motion: 'still' });
  const migrated = normalizeSettings(old);
  assert.deepEqual([migrated.inhale, migrated.exhale, migrated.holdIn, migrated.holdOut], [6, 6, 4, 3]);
  assert.deepEqual([migrated.minutes, migrated.sound, migrated.volume, migrated.cue, migrated.motion], [7, false, 0, 'soft', 'still']);
  assert.equal(migrated.preset, 'custom');
  assert.equal(migrated.pacing, 'guided');
  assert.equal(migrated.showSeconds, false);
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
    { id: 'inhale', label: 'Breathe in', seconds: 3, startMs: 0, endMs: 3000 },
    { id: 'exhale', label: 'Breathe out', seconds: 3, startMs: 3000, endMs: 6000 },
  ]);
  assert.equal(plan.cycleMs, 6000);
  assert.equal(plan.cycles, 10);
  assert.equal(plan.durationMs, 60000);
  assert.equal(plan.requestedMs, 60000);
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
  assert.equal(createPlan({ preset: 'even', minutes: 3 }).durationMs, 184000);
  assert.equal(createPlan({ preset: 'box', minutes: 3 }).durationMs, 192000);
});

test('inhale and exhale expansion are continuous and exact at phase boundaries', () => {
  const plan = createPlan({ preset: 'gentle', minutes: 3 });
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
  assert.equal(frameAt(plan, 4000).label, 'Pause after inhale');
  assert.equal(frameAt(plan, 12000).label, 'Pause after exhale');
});

test('visual easing has gentle turning points without changing phase durations', () => {
  const plan = createPlan();
  const firstQuarter = frameAt(plan, 750);
  const midpoint = frameAt(plan, 1500);
  const thirdQuarter = frameAt(plan, 2250);
  assert.equal(firstQuarter.phaseProgress, 0.25);
  assert.ok(firstQuarter.expansion > 0 && firstQuarter.expansion < 0.25);
  assert.equal(midpoint.expansion, 0.5);
  assert.ok(thirdQuarter.expansion > 0.75 && thirdQuarter.expansion < 1);
  assert.equal(frameAt(plan, 4500).expansion, 0.5);
  assert.ok(frameAt(plan, 1).expansion < 0.000001);
  assert.ok(Math.abs(frameAt(plan, 2999).expansion - frameAt(plan, 3000).expansion) < 0.000001);
  assert.ok(Math.abs(frameAt(plan, 5999).expansion - frameAt(plan, 6000).expansion) < 0.000001);
  assert.equal(frameAt(plan, 3000).phaseId, 'exhale');
  assert.equal(frameAt(plan, 6000).phaseId, 'inhale');
  let previous = 0;
  for (let elapsed = 0; elapsed <= 3000; elapsed += 10) {
    const expansion = frameAt(plan, elapsed).expansion;
    assert.ok(expansion >= previous);
    previous = expansion;
  }
});

test('own rhythm has exact requested duration with no prescribed phases or cycles', () => {
  for (const minutes of [1, 3, 7, 20]) {
    const plan = createPlan({ pacing: 'own', preset: 'box', minutes });
    assert.deepEqual(plan.phases, []);
    assert.equal(plan.cycleMs, 0);
    assert.equal(plan.cycles, 0);
    assert.equal(plan.durationMs, minutes * 60000);
    assert.equal(plan.requestedMs, plan.durationMs);
    assert.equal(plan.settings.pacing, 'own');
    assert.equal(plan.settings.preset, 'box');
  }
});

test('own-rhythm frames never prescribe movement, phases or measured breaths', () => {
  const plan = createPlan({ pacing: 'own', minutes: 3 });
  for (const elapsedMs of [0, 1, 4000, 74555.5, 179999]) {
    assert.deepEqual(frameAt(plan, elapsedMs), {
      complete: false, phaseId: 'natural', label: 'Breathe at your own pace', phaseIndex: -1,
      phaseProgress: 0, phaseRemainingMs: 0, remainingMs: 180000 - elapsedMs, elapsedMs,
      cycleNumber: 0, completedCycles: 0, expansion: 0,
    });
  }
});

test('own rhythm finishes exactly on time without invented breath counts', () => {
  const plan = createPlan({ pacing: 'own', preset: 'box', minutes: 1 });
  assert.equal(frameAt(plan, 59999).complete, false);
  const done = frameAt(plan, 60000);
  assert.equal(done.complete, true);
  assert.equal(done.label, 'Breathe naturally');
  assert.equal(done.remainingMs, 0);
  assert.equal(done.elapsedMs, 60000);
  assert.equal(done.cycleNumber, 0);
  assert.equal(done.completedCycles, 0);
  assert.equal(done.expansion, 0);
  assert.deepEqual(frameAt(plan, Infinity), done);
});

test('own-rhythm resume preserves actual elapsed time and clamps malformed input', () => {
  const plan = createPlan({ pacing: 'own' });
  assert.equal(restartCycleAt(plan, 17555.5), 17555.5);
  assert.equal(restartCycleAt(plan, 60000), 60000);
  assert.equal(restartCycleAt(plan, Infinity), 60000);
  for (const elapsed of [undefined, null, NaN, -Infinity, -1, '3000', Symbol('bad')]) {
    assert.equal(restartCycleAt(plan, elapsed), 0);
    assert.deepEqual(frameAt(plan, elapsed), frameAt(plan, 0));
  }
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
    { inhale: 6, exhale: 6, holdIn: 4, holdOut: 4, minutes: 20 },
    { inhale: 3, exhale: 5, holdIn: 2, holdOut: 0, minutes: 2 },
    { inhale: 2, exhale: 6, holdIn: 0, holdOut: 3, minutes: 3 },
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
