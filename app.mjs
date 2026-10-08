import { DEFAULTS, PRESETS, normalizeSettings, createPlan, formatTime } from './model.mjs';
import { SessionClock } from './session.mjs';
import { SoftAudio } from './audio.mjs';
import { StayAwake } from './screen.mjs';

const $ = id => document.getElementById(id);
const timingKeys = ['inhale', 'holdIn', 'exhale', 'holdOut'];
const storeKey = 'breathing-room.settings.v1';
const audio = new SoftAudio();
const screen = new StayAwake();
let settings = { ...DEFAULTS };
let storageOK = true;
let initialNotice = '';
try {
  const saved = localStorage.getItem(storeKey);
  if (saved) {
    settings = normalizeSettings(saved);
    try { JSON.parse(saved); } catch { initialNotice = 'Your saved settings could not be read. A gentle rhythm is ready.'; }
  }
} catch { storageOK = false; }

// Share only the rhythm, never device preferences or a session history.
const query = new URL(location.href).searchParams;
if (query.has('inhale')) {
  const imported = {};
  for (const key of [...timingKeys, 'minutes']) {
    const raw = query.get(key);
    if (raw !== null && /^\d{1,2}$/.test(raw)) imported[key] = Number(raw);
  }
  settings = normalizeSettings({ ...settings, ...imported });
  initialNotice = 'Shared rhythm loaded. Adjust it to feel comfortable.';
}

let plan = createPlan(settings);
const clock = new SessionClock(plan);
let animation = 0;
let lastPhase = '';
let lastStatus = '';
let audioEpoch = 0;
let audioWasReady = false;
let previewTimer = 0;
let audioWarning = false;

function notice(message) { $('notice').textContent = message; }
function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(settings)); }
  catch {
    notice('You can keep practising, but this browser could not save your settings.');
    storageOK = false;
  }
}

function soundStatus() {
  let message = 'Rising tone: breathe in. Falling tone: breathe out.';
  if (!settings.sound || settings.volume === 0) message = 'Silent mode. Follow the visual guide.';
  else if (!audio.available) message = 'Sound is unavailable in this browser. The visual guide still works.';
  else if (!audio.ready) message = 'Soft cues begin after you tap Start or Try the sound.';
  $('sound-state').textContent = message;
  $('test-sound').disabled = !settings.sound || settings.volume === 0 || !audio.available || ['preparing', 'running', 'paused'].includes(clock.status);
  $('volume').setAttribute('aria-valuetext', `${settings.volume} percent`);
}

function silence() {
  audioEpoch++;
  clearTimeout(previewTimer);
  audio.stop();
  audioWasReady = false;
}

function enableAudio() {
  const epoch = ++audioEpoch;
  audio.setTone(settings.cue);
  audio.setVolume(settings.volume);
  if (!settings.sound || settings.volume === 0) { soundStatus(); return Promise.resolve(false); }
  return audio.unlock().then(ready => {
    if (epoch !== audioEpoch) return false;
    audioWasReady = ready;
    if (!ready && !audioWarning) {
      audioWarning = true;
      notice('Sound could not start. You can follow the visual guide, or pause and resume to try again.');
    }
    soundStatus();
    return ready;
  });
}

function configure() {
  plan = createPlan(settings);
  clock.reset(plan);
  lastPhase = '';
  lastStatus = '';
  for (const key of timingKeys) $(key).value = settings[key];
  // Imported links may request any whole minute from 1 to 20.
  const select = $('minutes');
  select.querySelectorAll('[data-custom-minute]').forEach(option => option.remove());
  if (![...select.options].some(option => Number(option.value) === settings.minutes)) {
    const option = new Option(`${settings.minutes} minutes`, String(settings.minutes));
    option.dataset.customMinute = 'true';
    select.add(option);
  }
  select.value = settings.minutes;
  $('sound').checked = settings.sound;
  $('volume').value = settings.volume;
  $('cue').value = settings.cue;
  $('motion').value = settings.motion;
  document.body.dataset.motion = settings.motion;
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === settings.preset)));
  const parts = [`${settings.inhale}s in`];
  if (settings.holdIn) parts.push(`${settings.holdIn}s gentle hold`);
  parts.push(`${settings.exhale}s out`);
  if (settings.holdOut) parts.push(`${settings.holdOut}s gentle rest`);
  $('pattern-summary').textContent = parts.join(' · ') + '. No need to fill your lungs.';
  $('duration-note').textContent = plan.durationMs === plan.requestedMs
    ? 'Ends after a complete breath.'
    : `${formatTime(plan.durationMs)} total, so your last breath can finish.`;
  audio.setTone(settings.cue);
  audio.setVolume(settings.volume);
  render(clock.snapshot());
  soundStatus();
}

function readTiming() {
  for (const key of timingKeys) {
    if (!$(key).checkValidity()) {
      $('customize').open = true;
      $(key).reportValidity();
      return false;
    }
  }
  settings = normalizeSettings({ ...settings, ...Object.fromEntries(timingKeys.map(key => [key, $(key).valueAsNumber])), minutes: Number($('minutes').value) });
  return true;
}

function render(snapshot) {
  const { status, frame, elapsedMs, readyRemainingMs, completedNaturally } = snapshot;
  const active = ['preparing', 'running', 'paused'].includes(status);
  document.body.dataset.status = status;
  $('setup').disabled = active;
  $('reset').disabled = active;
  $('share').disabled = active;
  $('start').hidden = status !== 'idle';
  $('pause').hidden = !active;
  $('stop').hidden = !active;
  $('result').hidden = status !== 'complete';
  $('pause').textContent = status === 'paused' ? 'Resume' : 'Pause';
  $('progress').value = elapsedMs / plan.durationMs;
  $('session-clock').textContent = formatTime(frame.remainingMs);
  $('cycle-count').textContent = status === 'idle' ? 'Ready when you are' : `${frame.completedCycles} of ${plan.cycles} breaths`;
  const orb = $('breath-orb');
  orb.style.setProperty('--expansion', status === 'running' ? frame.expansion : 0);
  orb.dataset.phase = status === 'running' ? frame.phaseId : status;
  let label = 'Find a comfortable seat.';
  let guide = 'An easy breath. No need to breathe deeply.';
  let count = '';
  if (status === 'preparing') {
    label = 'Settle in';
    guide = 'Breathe naturally. We’ll begin with a gentle inhale.';
    count = Math.max(1, Math.ceil(readyRemainingMs / 1000));
  } else if (status === 'running') {
    label = frame.label;
    guide = frame.phaseId === 'inhale' ? 'An easy, comfortable breath.'
      : frame.phaseId === 'exhale' ? 'Let it go gently. No pushing.'
      : 'Only if comfortable. You can finish at any time.';
    count = Math.max(1, Math.ceil(frame.phaseRemainingMs / 1000));
    const phaseKey = `${frame.cycleNumber}:${frame.phaseId}`;
    if (phaseKey !== lastPhase) {
      lastPhase = phaseKey;
      $('phase-announcement').textContent = `${frame.label}, ${plan.phases[frame.phaseIndex].seconds} seconds.`;
      if (settings.sound && settings.volume > 0 && audio.ready) audio.cue(frame.phaseId);
    }
  } else if (status === 'paused') {
    label = 'Take your time.';
    guide = 'Breathe naturally. Resume starts with a fresh breath.';
  } else if (status === 'complete') {
    label = completedNaturally ? 'A little more space.' : 'Come back to your own rhythm.';
    guide = 'Let your breathing return to its natural pace.';
    $('result-summary').textContent = elapsedMs < 1000 ? 'Whenever you’re ready, there’s room for another breath.'
      : `${formatTime(elapsedMs)} of guided breathing${completedNaturally ? ' completed.' : '. Every comfortable moment counts.'}`;
  }
  $('phase-label').textContent = label;
  $('guide-note').textContent = guide;
  $('phase-count').textContent = count;
  if (status !== lastStatus) {
    if (status !== 'running') $('phase-announcement').textContent = `${label} ${guide}`;
    lastStatus = status;
    soundStatus();
  }
}

function finish(natural = false) {
  const restoreFocus = !natural || ['pause', 'stop'].includes(document.activeElement?.id);
  void screen.release();
  cancelAnimationFrame(animation);
  clearTimeout(previewTimer);
  if (natural && settings.sound && audio.ready) {
    audio.cue('complete');
    previewTimer = setTimeout(() => { silence(); soundStatus(); }, 1200);
  } else silence();
  render(natural ? clock.snapshot() : clock.finish(performance.now()));
  if (restoreFocus) $('again').focus({ preventScroll: true });
}

function pause(message = '') {
  void screen.release();
  cancelAnimationFrame(animation);
  silence();
  const snapshot = clock.pause(performance.now());
  if (snapshot.status === 'complete') { finish(snapshot.completedNaturally); return; }
  render(snapshot);
  if (message) notice(message);
  $('pause').focus({ preventScroll: true });
  soundStatus();
}

function tick(now) {
  const snapshot = clock.tick(now);
  if (snapshot.interrupted && snapshot.status === 'paused') {
    pause('Paused because the guide was interrupted. Resume when you’re ready.');
    return;
  }
  if (snapshot.status === 'complete') { finish(true); return; }
  if (audioWasReady && settings.sound && settings.volume > 0 && !audio.ready) {
    pause('Sound was interrupted. Resume to start again with a fresh breath.');
    return;
  }
  render(snapshot);
  if (['preparing', 'running'].includes(clock.status)) animation = requestAnimationFrame(tick);
}

function start() {
  if (['preparing', 'running'].includes(clock.status)) return;
  notice('');
  if (clock.status !== 'paused') {
    if (!readTiming()) return;
    configure();
    save();
  }
  silence();
  enableAudio(); // Starts within the user gesture; visuals never wait for audio.
  lastPhase = '';
  render(clock.prepare(performance.now()));
  void screen.acquire();
  $('pause').focus({ preventScroll: true });
  animation = requestAnimationFrame(tick);
}

$('start').addEventListener('click', start);
$('again').addEventListener('click', start);
$('pause').addEventListener('click', () => clock.status === 'paused' ? start() : pause());
$('stop').addEventListener('click', () => finish());
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  const preset = PRESETS.find(item => item.id === button.dataset.preset);
  settings = normalizeSettings({ ...settings, ...preset });
  notice(''); configure(); save();
}));
for (const key of [...timingKeys, 'minutes']) $(key).addEventListener('change', () => {
  if (readTiming()) { notice(''); configure(); save(); }
});
for (const key of timingKeys) $(key).addEventListener('input', () => {
  // Keep the summary honest while editing, without interrupting incomplete input.
  if (timingKeys.every(name => $(name).checkValidity()) && readTiming()) {
    notice(''); configure(); save();
  }
});

for (const key of ['sound', 'volume', 'cue', 'motion']) $(key).addEventListener(key === 'volume' ? 'input' : 'change', () => {
  settings = normalizeSettings({ ...settings, sound: $('sound').checked, volume: Number($('volume').value), cue: $('cue').value, motion: $('motion').value });
  document.body.dataset.motion = settings.motion;
  audio.setTone(settings.cue); audio.setVolume(settings.volume);
  if (key === 'sound') {
    if (settings.sound) enableAudio(); else silence();
  } else if (key === 'volume' && settings.sound && settings.volume > 0 && !audio.ready) enableAudio();
  soundStatus(); save();
});

$('test-sound').addEventListener('click', () => {
  silence();
  const promise = enableAudio();
  const epoch = audioEpoch;
  promise.then(ready => {
    if (!ready || epoch !== audioEpoch) return;
    audio.cue('inhale');
    notice('Rising: breathe in. Falling: breathe out. Keep your device volume comfortable.');
    previewTimer = setTimeout(() => {
      if (epoch === audioEpoch && !document.hidden) audio.cue('exhale');
    }, 1100);
  });
});

$('reset').addEventListener('click', () => {
  silence(); settings = { ...DEFAULTS }; configure(); notice('Gentle defaults restored.'); save();
  const url = new URL(location.href); url.search = ''; history.replaceState(null, '', url);
});

let linkDialog;
$('share').addEventListener('click', async () => {
  if (!readTiming()) return;
  const url = new URL(location.href); url.search = ''; url.hash = '';
  for (const key of [...timingKeys, 'minutes']) url.searchParams.set(key, settings[key]);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url.href);
    notice('Session link copied. It shares your rhythm and length only.');
  } catch {
    if (!linkDialog) {
      linkDialog = document.createElement('dialog');
      const label = document.createElement('label'); label.textContent = 'Copy this session link'; label.id = 'share-title';
      linkDialog.setAttribute('aria-labelledby', label.id);
      const input = document.createElement('input'); input.type = 'url'; input.readOnly = true; input.id = 'session-link';
      label.htmlFor = input.id;
      const close = document.createElement('button'); close.type = 'button'; close.className = 'button button-primary'; close.textContent = 'Done';
      close.addEventListener('click', () => linkDialog.close());
      linkDialog.append(label, input, close); document.body.append(linkDialog);
    }
    linkDialog.querySelector('input').value = url.href;
    linkDialog.showModal(); linkDialog.querySelector('input').select();
    notice('Automatic copying is unavailable. Select and copy the link.');
  }
});

function backgroundPause() {
  void screen.release();
  if (['preparing', 'running'].includes(clock.status)) pause('Paused while you were away. Keep this page open during a session.');
  else { silence(); soundStatus(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundPause(); });
window.addEventListener('pagehide', backgroundPause);
configure();
notice(initialNotice || (!storageOK ? 'Settings will last for this visit. Browser storage is unavailable.' : ''));
