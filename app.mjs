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
if (query.has('inhale') || query.has('pacing')) {
  const imported = {};
  for (const key of [...timingKeys, 'minutes']) {
    const raw = query.get(key);
    if (raw !== null && /^\d{1,2}$/.test(raw)) imported[key] = Number(raw);
  }
  imported.pacing = query.get('pacing') === 'own' ? 'own' : 'guided';
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
  const ownPace = settings.pacing === 'own';
  let message = ownPace ? 'Only an ending chime. No cues to change your breathing.' : 'Rising tone: inhale. Falling tone: exhale. Skip any cue if needed.';
  if (!settings.sound || settings.volume === 0) message = ownPace ? 'A silent timer. Breathe in your own way.' : 'Silent mode. Follow the guide only if comfortable.';
  else if (!audio.available) message = ownPace ? 'Sound is unavailable. Your quiet timer still works.' : 'Sound is unavailable in this browser. The visual guide still works.';
  else if (!audio.ready) message = ownPace ? 'An ending chime, if sound is available. No breathing cues.' : 'Soft cues begin after you tap Start or Try the sound.';
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
      notice(settings.pacing === 'own' ? 'Sound could not start. Your quiet timer still works.' : 'Sound could not start. Follow the guide only if comfortable, or take a break and resume to try again.');
    }
    soundStatus();
    return ready;
  });
}

function configure() {
  silence();
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
  $('showSeconds').checked = settings.showSeconds;
  document.body.dataset.motion = settings.motion;
  document.body.dataset.pacing = settings.pacing;
  $('rhythm-options').hidden = settings.pacing === 'own';
  $('customize').hidden = settings.pacing === 'own';
  $('holds-note').hidden = !(settings.holdIn || settings.holdOut);
  $('skip-holds').disabled = !(settings.holdIn || settings.holdOut);
  document.querySelectorAll('button[data-pacing]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pacing === settings.pacing)));
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === settings.preset)));
  const parts = [`${settings.inhale}s in`];
  if (settings.holdIn) parts.push(`${settings.holdIn}s hold after in`);
  parts.push(`${settings.exhale}s out`);
  if (settings.holdOut) parts.push(`${settings.holdOut}s hold after out`);
  $('pattern-summary').textContent = parts.join(' · ') + '. Comfort comes before the count.';
  $('duration-note').textContent = settings.pacing === 'own' ? 'No breathing targets. A quiet moment at your own pace.' : plan.durationMs === plan.requestedMs
    ? 'Ends after a complete breath.'
    : `${formatTime(plan.durationMs)} total, so your last breath can finish.`;
  audio.setTone(settings.cue);
  audio.setVolume(settings.volume);
  render(clock.snapshot());
  soundStatus();
}

function readTiming() {
  for (const key of settings.pacing === 'own' ? [] : timingKeys) {
    if (!$(key).checkValidity()) {
      $('customize').open = true;
      $(key).reportValidity();
      return false;
    }
  }
  settings = normalizeSettings({ ...settings, ...(settings.pacing === 'own' ? {} : Object.fromEntries(timingKeys.map(key => [key, $(key).valueAsNumber]))), minutes: Number($('minutes').value) });
  return true;
}

function render(snapshot) {
  const { status, frame, elapsedMs, readyRemainingMs, completedNaturally } = snapshot;
  const active = ['preparing', 'running', 'paused'].includes(status);
  const guiding = ['preparing', 'running'].includes(status);
  const ownPace = settings.pacing === 'own';
  document.body.dataset.status = status;
  $('setup').disabled = guiding;
  $('reset').disabled = guiding;
  $('share').disabled = guiding;
  $('start').hidden = status !== 'idle';
  $('pause').hidden = !active;
  $('stop').hidden = !active;
  $('result').hidden = status !== 'complete';
  $('pause').textContent = status === 'paused' ? (ownPace ? 'Continue' : 'Resume guide') : (ownPace ? 'Pause timer' : 'Breathe freely');
  $('progress').value = elapsedMs / plan.durationMs;
  $('session-clock').textContent = formatTime(frame.remainingMs);
  $('cycle-count').textContent = ownPace ? 'Your own rhythm' : settings.showSeconds && status === 'running' ? `Guide cycle ${frame.cycleNumber} of ${plan.cycles}` : 'Follow only if comfortable';
  const orb = $('breath-orb');
  if (status === 'running' && !ownPace) orb.style.setProperty('--expansion', frame.expansion);
  else if (status === 'idle') orb.style.setProperty('--expansion', 0);
  orb.dataset.phase = status === 'running' ? frame.phaseId : status;
  let label = 'Find a comfortable seat.';
  let guide = ownPace ? 'Let your breathing find its own comfortable rhythm.' : 'Keep breaths easy. Join the guide only if comfortable.';
  let count = '';
  if (status === 'preparing') {
    label = 'Settle in';
    guide = ownPace ? 'Nothing to match. Breathe in your own way.' : 'Breathe normally. Join any inhale when it feels easy.';
    count = settings.showSeconds && !ownPace ? Math.max(1, Math.ceil(readyRemainingMs / 1000)) : '';
  } else if (status === 'running' && ownPace) {
    label = 'Breathe in your own way.';
    guide = 'No need to slow, deepen or hold your breath.';
    if (lastPhase !== 'natural') {
      lastPhase = 'natural';
      $('phase-announcement').textContent = `${label} ${guide}`;
    }
  } else if (status === 'running') {
    label = frame.label;
    guide = frame.phaseId === 'inhale' ? 'An easy, comfortable breath.'
      : frame.phaseId === 'exhale' ? 'Let it go gently. No pushing.'
      : 'Skip this pause whenever you need a breath.';
    count = settings.showSeconds ? Math.max(1, Math.ceil(frame.phaseRemainingMs / 1000)) : '';
    const phaseKey = `${frame.cycleNumber}:${frame.phaseId}`;
    if (phaseKey !== lastPhase) {
      lastPhase = phaseKey;
      $('phase-announcement').textContent = settings.showSeconds ? `${frame.label}, ${plan.phases[frame.phaseIndex].seconds} seconds.` : frame.label;
      if (settings.sound && settings.volume > 0 && audio.ready) audio.cue(frame.phaseId);
    }
  } else if (status === 'paused') {
    label = 'Take your time.';
    guide = 'Breathe in your own way. Continue or adjust the rhythm when comfortable.';
  } else if (status === 'complete') {
    label = completedNaturally ? 'A little more space.' : 'Come back to your own rhythm.';
    guide = 'Let your breathing return to its natural pace.';
    $('result-summary').textContent = elapsedMs < 1000 ? 'Whenever you’re ready, there’s room for another breath.'
      : `${formatTime(elapsedMs)} ${ownPace ? 'at your own pace' : 'with the guide'}${completedNaturally ? ' completed.' : '. You can stop whenever you need to.'}`;
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
    if (settings.pacing === 'guided') {
      pause('Sound was interrupted. Resume when comfortable.');
      return;
    }
    audioWasReady = false;
    soundStatus();
    notice('Sound was interrupted. Your quiet timer continues.');
  }
  render(snapshot);
  if (['preparing', 'running'].includes(clock.status)) animation = requestAnimationFrame(tick);
}

function start() {
  if (['preparing', 'running'].includes(clock.status)) return;
  if (!readTiming()) return;
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
function applySetup(message = '') {
  const wasPaused = clock.status === 'paused';
  configure();
  notice(message || (wasPaused ? 'Rhythm changed. Start a new session when comfortable.' : ''));
  save();
}
document.querySelectorAll('button[data-pacing]').forEach(button => button.addEventListener('click', () => {
  settings = normalizeSettings({ ...settings, pacing: button.dataset.pacing });
  applySetup();
}));
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  const preset = PRESETS.find(item => item.id === button.dataset.preset);
  settings = normalizeSettings({ ...settings, ...preset });
  applySetup();
}));
$('skip-holds').addEventListener('click', () => {
  settings = normalizeSettings({ ...settings, holdIn: 0, holdOut: 0 });
  applySetup('Holds removed. Start when comfortable.');
  $('inhale').focus({ preventScroll: true });
});
for (const key of [...timingKeys, 'minutes']) $(key).addEventListener('change', () => {
  const before = JSON.stringify(settings);
  if (readTiming() && before !== JSON.stringify(settings)) applySetup();
});
for (const key of timingKeys) $(key).addEventListener('input', () => {
  // Keep the summary honest while editing, without interrupting incomplete input.
  if (timingKeys.every(name => $(name).checkValidity()) && readTiming()) {
    applySetup();
  }
});

for (const key of ['sound', 'volume', 'cue', 'motion', 'showSeconds']) $(key).addEventListener(key === 'volume' ? 'input' : 'change', () => {
  settings = normalizeSettings({ ...settings, sound: $('sound').checked, volume: Number($('volume').value), cue: $('cue').value, motion: $('motion').value, showSeconds: $('showSeconds').checked });
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
    if (settings.pacing === 'own') {
      audio.cue('complete');
      notice('A quiet chime at the end. No sounds to pace your breathing.');
      return;
    }
    audio.cue('inhale');
    notice('Rising: breathe in. Falling: breathe out. Keep your device volume comfortable.');
    previewTimer = setTimeout(() => {
      if (epoch === audioEpoch && !document.hidden) audio.cue('exhale');
    }, 1100);
  });
});

$('reset').addEventListener('click', () => {
  silence(); settings = { ...DEFAULTS }; configure(); notice('Short, hold-free defaults restored.'); save();
  const url = new URL(location.href); url.search = ''; history.replaceState(null, '', url);
});

let linkDialog;
$('share').addEventListener('click', async () => {
  if (!readTiming()) return;
  const url = new URL(location.href); url.search = ''; url.hash = '';
  url.searchParams.set('pacing', settings.pacing);
  for (const key of settings.pacing === 'own' ? ['minutes'] : [...timingKeys, 'minutes']) url.searchParams.set(key, settings[key]);
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
