import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan } from '../model.mjs';
import { SessionClock } from '../session.mjs';

function start(clock, now = 0) {
  clock.prepare(now);
  clock.tick(now + 1000);
  clock.tick(now + 2000);
  return clock.tick(now + 3000);
}

function advance(clock, target) {
  while (clock.lastTick < target && ['running', 'preparing'].includes(clock.status)) {
    clock.tick(Math.min(target, clock.lastTick + 1000));
  }
  return clock.snapshot();
}

test('new clock is idle and provides a complete safe snapshot', () => {
  const clock = new SessionClock();
  assert.equal(clock.status, 'idle');
  assert.deepEqual(Object.keys(clock.snapshot()).sort(), ['completedNaturally', 'elapsedMs', 'frame', 'interrupted', 'readyRemainingMs', 'status']);
  assert.equal(clock.snapshot().frame.phaseId, 'inhale');
  assert.equal(clock.elapsedMs, 0);
  assert.equal(clock.snapshot().readyRemainingMs, 0);
  assert.equal(clock.snapshot().completedNaturally, false);
  assert.equal(clock.snapshot().interrupted, false);
  assert.deepEqual(clock.tick(100000), clock.snapshot());
});

test('preparation lasts three seconds and is excluded from breathing time', () => {
  const clock = new SessionClock();
  assert.equal(clock.prepare(10000).readyRemainingMs, 3000);
  const preparing = clock.tick(11999);
  assert.equal(preparing.status, 'preparing');
  assert.equal(preparing.readyRemainingMs, 1001);
  assert.equal(preparing.elapsedMs, 0);
  assert.equal(clock.tick(12999).readyRemainingMs, 1);
  const ready = clock.tick(13000);
  assert.equal(ready.status, 'running');
  assert.equal(ready.elapsedMs, 0);
  assert.equal(ready.readyRemainingMs, 0);
  assert.equal(ready.frame.phaseId, 'inhale');
  assert.equal(clock.tick(14000).elapsedMs, 1000);
});

test('a tick just after readiness counts only time after the preparation', () => {
  const clock = new SessionClock();
  clock.prepare(100);
  clock.tick(2000);
  const ready = clock.tick(3500);
  assert.equal(ready.status, 'running');
  assert.equal(ready.elapsedMs, 400);
  assert.equal(ready.frame.phaseProgress, 400 / 5000);
});

test('repeated prepare does not reset an active countdown or running breath', () => {
  const clock = new SessionClock();
  clock.prepare(0);
  clock.tick(1000);
  assert.equal(clock.prepare(1500).readyRemainingMs, 2000);
  assert.equal(clock.readyAt, 3000);
  clock.tick(2000);
  clock.tick(3000);
  clock.tick(4500);
  assert.equal(clock.prepare(4600).elapsedMs, 1500);
  assert.equal(clock.status, 'running');
});

test('pause safely samples a short observed gap and then freezes', () => {
  const clock = new SessionClock();
  start(clock);
  clock.tick(4000);
  const paused = clock.pause(4500);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.elapsedMs, 1500);
  assert.equal(paused.interrupted, false);
  assert.deepEqual(clock.tick(90000), paused);
  assert.deepEqual(clock.pause(90000), paused);
});

test('resume from a hold rewinds its whole cycle and runs a fresh preparation', () => {
  const clock = new SessionClock(createPlan({ preset: 'box' }));
  start(clock, 1000);
  advance(clock, 25500);
  assert.equal(clock.snapshot().frame.phaseId, 'holdIn');
  assert.equal(clock.elapsedMs, 21500);
  clock.pause(25500);
  const resume = clock.prepare(50000);
  assert.equal(resume.status, 'preparing');
  assert.equal(resume.elapsedMs, 16000);
  assert.equal(resume.frame.phaseId, 'inhale');
  assert.equal(resume.frame.phaseProgress, 0);
  assert.equal(resume.readyRemainingMs, 3000);
  clock.tick(51000);
  clock.tick(52000);
  const running = clock.tick(53000);
  assert.equal(running.status, 'running');
  assert.equal(running.elapsedMs, 16000);
  assert.equal(clock.tick(54000).elapsedMs, 17000);
});

test('pause during preparation preserves the resume base and restarts all three seconds', () => {
  const clock = new SessionClock(createPlan({ preset: 'even' }));
  start(clock);
  advance(clock, 12500);
  clock.pause(12500);
  clock.prepare(20000);
  assert.equal(clock.elapsedMs, 8000);
  const paused = clock.pause(21000);
  assert.equal(paused.elapsedMs, 8000);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.readyRemainingMs, 0);
  assert.equal(clock.prepare(30000).readyRemainingMs, 3000);
  assert.equal(clock.elapsedMs, 8000);
});

test('pausing an unobserved preparation ending does not count an unstarted breath', () => {
  const clock = new SessionClock();
  clock.prepare(0);
  clock.tick(2000);
  const paused = clock.pause(3500);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.elapsedMs, 0);
  assert.equal(paused.interrupted, false);
});

test('a gap over two seconds interrupts without counting unobserved time', () => {
  const clock = new SessionClock();
  start(clock);
  clock.tick(4000);
  const interrupted = clock.tick(6001);
  assert.equal(interrupted.status, 'paused');
  assert.equal(interrupted.elapsedMs, 1000);
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.completedNaturally, false);
  assert.deepEqual(clock.tick(1000000), interrupted);
  const resume = clock.prepare(1000000);
  assert.equal(resume.interrupted, false);
  assert.equal(resume.elapsedMs, 0);
});

test('exactly two seconds is observed and still advances normally', () => {
  const clock = new SessionClock();
  clock.prepare(0);
  clock.tick(2000);
  const running = clock.tick(4000);
  assert.equal(running.status, 'running');
  assert.equal(running.elapsedMs, 1000);
  assert.equal(clock.tick(6000).elapsedMs, 3000);
  assert.equal(clock.snapshot().interrupted, false);
});

test('a suspended countdown pauses without silently starting a breath', () => {
  const clock = new SessionClock();
  clock.prepare(100);
  clock.tick(1100);
  const interrupted = clock.tick(3101);
  assert.equal(interrupted.status, 'paused');
  assert.equal(interrupted.elapsedMs, 0);
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.readyRemainingMs, 0);
});

test('pause after a long gap freezes the last reliable breathing sample', () => {
  const clock = new SessionClock();
  start(clock);
  clock.tick(4500);
  const paused = clock.pause(20000);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.elapsedMs, 1500);
  assert.equal(paused.interrupted, true);
});

test('natural completion is capped and stays complete under repeated operations', () => {
  const clock = new SessionClock(createPlan({ preset: 'even', minutes: 1 }));
  start(clock);
  advance(clock, clock.plan.durationMs + 2999);
  assert.equal(clock.status, 'running');
  const complete = clock.tick(clock.plan.durationMs + 3000);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.completedNaturally, true);
  assert.equal(complete.elapsedMs, clock.plan.durationMs);
  assert.equal(complete.frame.complete, true);
  assert.equal(complete.frame.label, 'Breathe naturally');
  assert.deepEqual(clock.tick(999999), complete);
  assert.deepEqual(clock.pause(999999), complete);
  assert.deepEqual(clock.finish(999999), complete);
});

test('late but observed completion clamps overshoot to session duration', () => {
  const clock = new SessionClock(createPlan({ minutes: 1 }));
  start(clock);
  advance(clock, 62500);
  assert.equal(clock.elapsedMs, 59500);
  const complete = clock.tick(64000);
  assert.equal(complete.completedNaturally, true);
  assert.equal(complete.elapsedMs, 60000);
});

test('finishing early retains actual practice time and never claims natural completion', () => {
  const clock = new SessionClock();
  start(clock);
  clock.tick(4000);
  const ended = clock.finish(4500);
  assert.equal(ended.status, 'complete');
  assert.equal(ended.elapsedMs, 1500);
  assert.equal(ended.completedNaturally, false);
  assert.equal(ended.frame.complete, false);
  assert.deepEqual(clock.finish(999999), ended);
  assert.deepEqual(clock.tick(999999), ended);
});

test('finishing after suspension does not count time with no reliable guidance', () => {
  const clock = new SessionClock();
  start(clock);
  clock.tick(4000);
  const ended = clock.finish(999999);
  assert.equal(ended.elapsedMs, 1000);
  assert.equal(ended.status, 'complete');
  assert.equal(ended.completedNaturally, false);
  assert.equal(ended.interrupted, false);
});

test('starting after either kind of completion begins a new complete session', () => {
  for (const natural of [true, false]) {
    const clock = new SessionClock(createPlan({ minutes: 1 }));
    start(clock);
    if (natural) advance(clock, 63000);
    else clock.finish(4000);
    const restart = clock.prepare(70000);
    assert.equal(restart.status, 'preparing');
    assert.equal(restart.elapsedMs, 0);
    assert.equal(restart.readyRemainingMs, 3000);
    assert.equal(restart.completedNaturally, false);
    assert.equal(restart.interrupted, false);
  }
});

test('reset replaces the plan and clears all prior session state', () => {
  const clock = new SessionClock();
  start(clock);
  clock.tick(6001);
  const replacement = createPlan({ preset: 'box', minutes: 7 });
  const reset = clock.reset(replacement);
  assert.equal(clock.plan, replacement);
  assert.equal(reset.status, 'idle');
  assert.equal(reset.elapsedMs, 0);
  assert.equal(reset.interrupted, false);
  assert.equal(reset.completedNaturally, false);
  assert.equal(reset.frame.remainingMs, replacement.durationMs);
  assert.deepEqual(clock.reset(), reset);
});

test('backward and invalid timestamps never reverse time or introduce NaN', () => {
  const clock = new SessionClock();
  start(clock);
  clock.tick(4000);
  const before = clock.snapshot();
  for (const value of [3999, -1, NaN, Infinity, -Infinity, null, undefined, '5000', {}, Symbol('time')]) {
    assert.deepEqual(clock.tick(value), before);
    assert.ok(Number.isFinite(clock.elapsedMs));
  }
  assert.equal(clock.tick(4500).elapsedMs, 1500);
});

test('reading snapshots never advances breathing time or causes transitions', () => {
  const clock = new SessionClock();
  clock.prepare(0);
  assert.equal(clock.snapshot(1500).readyRemainingMs, 1500);
  assert.equal(clock.lastTick, 0);
  assert.equal(clock.snapshot(100000).status, 'preparing');
  assert.equal(clock.elapsedMs, 0);
  assert.equal(clock.snapshot().readyRemainingMs, 3000);
});

test('own-rhythm pause and resume preserve time without rewinding or prescribing a phase', () => {
  const clock = new SessionClock(createPlan({ pacing: 'own', minutes: 1 }));
  start(clock, 1000);
  advance(clock, 11555);
  const paused = clock.pause(11555);
  assert.equal(paused.elapsedMs, 7555);
  assert.equal(paused.frame.phaseId, 'natural');
  assert.equal(paused.frame.completedCycles, 0);
  const preparing = clock.prepare(50000);
  assert.equal(preparing.elapsedMs, 7555);
  assert.equal(preparing.readyRemainingMs, 3000);
  assert.equal(preparing.frame.expansion, 0);
  clock.tick(51000);
  clock.tick(52000);
  assert.equal(clock.tick(53000).elapsedMs, 7555);
  assert.equal(clock.tick(54000).elapsedMs, 8555);
});

test('own rhythm completes naturally on its timer without any breath-count claim', () => {
  const clock = new SessionClock(createPlan({ pacing: 'own', preset: 'box', minutes: 1 }));
  start(clock);
  advance(clock, 62999);
  assert.equal(clock.status, 'running');
  assert.equal(clock.snapshot().frame.phaseId, 'natural');
  const done = clock.tick(63000);
  assert.equal(done.status, 'complete');
  assert.equal(done.completedNaturally, true);
  assert.equal(done.elapsedMs, 60000);
  assert.equal(done.frame.completedCycles, 0);
  assert.equal(done.frame.cycleNumber, 0);
  assert.equal(done.frame.complete, true);
});

test('own rhythm freezes missing time on interruption and resumes from its saved time', () => {
  const clock = new SessionClock(createPlan({ pacing: 'own' }));
  start(clock);
  clock.tick(4500);
  const interrupted = clock.tick(20000);
  assert.equal(interrupted.status, 'paused');
  assert.equal(interrupted.interrupted, true);
  assert.equal(interrupted.elapsedMs, 1500);
  const resumed = clock.prepare(30000);
  assert.equal(resumed.elapsedMs, 1500);
  assert.equal(resumed.interrupted, false);
  assert.equal(resumed.frame.phaseId, 'natural');
  assert.equal(resumed.frame.expansion, 0);
});
