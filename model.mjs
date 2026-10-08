/** Pure timing and settings rules. The UI supplies a monotonic elapsed time. */
export const PRESETS = Object.freeze([
  Object.freeze({ id: 'slow', name: 'Slow & even', inhale: 5, holdIn: 0, exhale: 5, holdOut: 0, description: 'Slow, equal breaths without pauses. Adjust the pace to your comfort.' }),
  Object.freeze({ id: 'easy', name: 'Easy rhythm', inhale: 3, holdIn: 0, exhale: 3, holdOut: 0, description: 'Equal time breathing in and out, without pauses.' }),
  Object.freeze({ id: 'gentle', name: 'Longer exhale', inhale: 4, holdIn: 0, exhale: 6, holdOut: 0, description: 'A comfortable inhale and a slightly longer exhale.' }),
  Object.freeze({ id: 'even', name: 'Even rhythm', inhale: 4, holdIn: 0, exhale: 4, holdOut: 0, description: 'Equal time breathing in and out, without pauses.' }),
  Object.freeze({ id: 'box', name: 'Box breathing', inhale: 4, holdIn: 4, exhale: 4, holdOut: 4, description: 'Equal breaths and optional gentle pauses.' }),
]);

export const DEFAULTS = Object.freeze({
  preset: 'slow', inhale: 5, holdIn: 0, exhale: 5, holdOut: 0,
  minutes: 1, sound: true, volume: 25, cue: 'bell', motion: 'auto',
  pacing: 'guided', showSeconds: false, practice: 'mindful', settingsVersion: 2,
});

const TIMING_KEYS = Object.freeze(['inhale', 'holdIn', 'exhale', 'holdOut']);
const PHASES = Object.freeze([
  { id: 'inhale', label: 'Breathe in' },
  { id: 'holdIn', label: 'Pause after inhale' },
  { id: 'exhale', label: 'Breathe out' },
  { id: 'holdOut', label: 'Pause after exhale' },
]);

function settingsObject(input) {
  try {
    // A damaged or unexpectedly large saved value must not prevent a session.
    if (typeof input === 'string') input = input.length <= 4096 ? JSON.parse(input) : null;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const prototype = Object.getPrototypeOf(input);
    return prototype === Object.prototype || prototype === null ? input : {};
  } catch {
    return {};
  }
}

function ownValue(object, key) {
  try {
    return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
  } catch {
    return undefined;
  }
}

function boundedInteger(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)))
    : fallback;
}

export function normalizeSettings(input) {
  const source = settingsObject(input);
  const selected = PRESETS.find(preset => preset.id === ownValue(source, 'preset')) ?? PRESETS[0];
  const result = {
    preset: selected.id,
    // These are product bounds, not medically validated safety thresholds.
    inhale: boundedInteger(ownValue(source, 'inhale'), selected.inhale, 2, 6),
    holdIn: boundedInteger(ownValue(source, 'holdIn'), selected.holdIn, 0, 4),
    exhale: boundedInteger(ownValue(source, 'exhale'), selected.exhale, 2, 6),
    holdOut: boundedInteger(ownValue(source, 'holdOut'), selected.holdOut, 0, 4),
    minutes: boundedInteger(ownValue(source, 'minutes'), DEFAULTS.minutes, 1, 20),
    sound: DEFAULTS.sound,
    volume: boundedInteger(ownValue(source, 'volume'), DEFAULTS.volume, 0, 60),
    cue: DEFAULTS.cue,
    motion: DEFAULTS.motion,
    pacing: DEFAULTS.pacing,
    showSeconds: DEFAULTS.showSeconds,
    practice: DEFAULTS.practice,
    settingsVersion: DEFAULTS.settingsVersion,
  };
  const sound = ownValue(source, 'sound');
  if (typeof sound === 'boolean') result.sound = sound;
  const cue = ownValue(source, 'cue');
  if (cue === 'bell' || cue === 'soft') result.cue = cue;
  const motion = ownValue(source, 'motion');
  if (motion === 'auto' || motion === 'still') result.motion = motion;
  const pacing = ownValue(source, 'pacing');
  if (pacing === 'guided' || pacing === 'own') result.pacing = pacing;
  const showSeconds = ownValue(source, 'showSeconds');
  if (typeof showSeconds === 'boolean') result.showSeconds = showSeconds;
  const practice = ownValue(source, 'practice');
  if (practice === 'mindful' || practice === 'sigh') result.practice = practice;
  // The name always describes the actual rhythm, including after an import.
  result.preset = PRESETS.find(preset => TIMING_KEYS.every(key => preset[key] === result[key]))?.id ?? 'custom';
  return result;
}

/** Restore device preferences; explicit rhythm links use normalizeSettings. */
export function restoreSettings(input) {
  const source = settingsObject(input);
  const restored = normalizeSettings(source);
  const pacing = ownValue(source, 'pacing');
  const isLegacyDefault = ownValue(source, 'settingsVersion') === undefined
    && ownValue(source, 'preset') === 'easy'
    && (pacing === undefined || pacing === 'guided')
    && ownValue(source, 'inhale') === 3 && ownValue(source, 'holdIn') === 0
    && ownValue(source, 'exhale') === 3 && ownValue(source, 'holdOut') === 0;
  if (isLegacyDefault) {
    restored.preset = 'slow';
    restored.inhale = 5;
    restored.exhale = 5;
  }
  return restored;
}

export function createPlan(input) {
  const settings = normalizeSettings(input);
  const requestedMs = settings.minutes * 60_000;
  if (settings.pacing === 'own') {
    return { settings, phases: [], cycleMs: 0, cycles: 0, durationMs: requestedMs, requestedMs };
  }
  const phases = [];
  let cycleMs = 0;
  for (const phase of PHASES) {
    const seconds = settings[phase.id];
    if (seconds === 0) continue;
    const startMs = cycleMs;
    cycleMs += seconds * 1000;
    phases.push({ ...phase, seconds, startMs, endMs: cycleMs });
  }
  // Finish the current whole breath instead of cutting off its exhale.
  const cycles = Math.ceil(requestedMs / cycleMs);
  return { settings, phases, cycleMs, cycles, durationMs: cycles * cycleMs, requestedMs };
}

function boundedElapsed(value, durationMs) {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return 0;
  return Math.min(value, durationMs);
}

export function frameAt(plan, elapsed) {
  const elapsedMs = boundedElapsed(elapsed, plan.durationMs);
  const remainingMs = plan.durationMs - elapsedMs;
  if (remainingMs === 0) {
    return {
      complete: true, phaseId: null, label: 'Breathe naturally', phaseIndex: -1,
      phaseProgress: 1, phaseRemainingMs: 0, remainingMs: 0, elapsedMs,
      cycleNumber: plan.cycles, completedCycles: plan.cycles, expansion: 0,
    };
  }
  if (plan.settings.pacing === 'own') {
    return {
      complete: false, phaseId: 'natural', label: 'Breathe at your own pace', phaseIndex: -1,
      phaseProgress: 0, phaseRemainingMs: 0, remainingMs, elapsedMs,
      cycleNumber: 0, completedCycles: 0, expansion: 0,
    };
  }
  const completedCycles = Math.floor(elapsedMs / plan.cycleMs);
  const cycleElapsedMs = elapsedMs % plan.cycleMs;
  const phaseIndex = plan.phases.findIndex(phase => cycleElapsedMs < phase.endMs);
  const phase = plan.phases[phaseIndex];
  const phaseProgress = (cycleElapsedMs - phase.startMs) / (phase.seconds * 1000);
  // Ease the visual at each turning point; it does not represent lung volume.
  const easedProgress = phaseProgress === 0.5 ? 0.5 : (1 - Math.cos(Math.PI * phaseProgress)) / 2;
  const expansion = phase.id === 'inhale' ? easedProgress
    : phase.id === 'holdIn' ? 1
    : phase.id === 'exhale' ? 1 - easedProgress
    : 0;
  return {
    complete: false, phaseId: phase.id, label: phase.label, phaseIndex,
    phaseProgress, phaseRemainingMs: phase.endMs - cycleElapsedMs,
    remainingMs, elapsedMs, cycleNumber: completedCycles + 1, completedCycles,
    expansion,
  };
}

export function restartCycleAt(plan, elapsed) {
  const elapsedMs = boundedElapsed(elapsed, plan.durationMs);
  if (plan.settings.pacing === 'own') return elapsedMs;
  return Math.floor(elapsedMs / plan.cycleMs) * plan.cycleMs;
}

export function formatTime(milliseconds) {
  const safe = typeof milliseconds === 'number' && Number.isFinite(milliseconds)
    ? Math.max(0, Math.min(milliseconds, Number.MAX_SAFE_INTEGER)) : 0;
  const seconds = Math.ceil(safe / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
