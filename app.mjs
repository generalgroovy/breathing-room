import { DEFAULTS, PRESETS, normalizeSettings, restoreSettings, createPlan, formatTime } from './model.mjs';
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
let migratedStarter = false;
try {
  const saved = localStorage.getItem(storeKey);
  if (saved) {
    settings = restoreSettings(saved);
    migratedStarter = normalizeSettings(saved).preset === 'easy' && settings.preset === 'slow';
    if (migratedStarter) initialNotice = 'The starting rhythm is now slower: 5 seconds in, 5 out. Adjust it whenever you like.';
    try { JSON.parse(saved); } catch { initialNotice = 'Saved settings could not be read. Default timing restored.'; }
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
  imported.practice = query.get('practice') === 'sigh' ? 'sigh' : 'mindful';
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

const nhsBreathing = ['NHS breathing guidance', 'https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/'];
const structuredStudy = ['Box & sigh study (2023)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947/'];
const techniqueNotes = {
  slow: {
    description: 'A slower, even rhythm. Five seconds in, five out, without holds.',
    guidance: 'Let the inhale arrive gently and the exhale leave without pushing. Breathe sooner whenever you need to. Six guide cycles per minute is an option, not a target for everyone.',
    evidence: 'Slow, equal breathing is studied, but no pace is universally best. This 5/5 guide is a simple adaptation: the linked trial used about 5.5 seconds each way, 10 minutes daily for four weeks, and found no advantage over its faster comparison for psychological outcomes.',
    links: [nhsBreathing, ['Slow-breathing trial (2023)', 'https://www.nature.com/articles/s41598-023-49279-8']],
  },
  gentle: {
    description: 'A gentle inhale with a little more time to breathe out.',
    guidance: 'Inhale for four seconds and let the exhale last six only if it feels easy. Keep your breath comfortable in size; you do not need to empty your lungs.',
    evidence: 'The 4/6 timing is this app’s adjustable starting point. A trial comparing longer versus equal exhales found no clear difference in stress reduction. A longer exhale is a preference, not an established better ratio.',
    links: [nhsBreathing, ['Exhale-ratio trial (2023)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10395759/']],
  },
  box: {
    description: 'Four equal steps, with optional pauses between breaths.',
    guidance: 'Breathe in for four, pause for four, breathe out for four, then pause for four. Breathe sooner if needed. “Adjust timing” lets you shorten or remove the pauses.',
    evidence: 'Four-second square breathing appears in NHS guidance. The research trial used five minutes daily and adjusted phase lengths to participants; four seconds is not a universal prescription.',
    links: [['NHS square-breathing guide', 'https://www.rnoh.nhs.uk/patients-and-visitors/patient-information-guides/relaxation-techniques-pain-management'], structuredStudy],
  },
  mindful: {
    description: 'Notice your ordinary breath. No timing to follow.',
    guidance: 'Notice where you feel your breath: perhaps at your nose or in the movement of your body. When attention wanders, gently return. Leave the pace and size of your breathing alone.',
    evidence: 'Mindful breathing is an attention practice, not a breathing-speed prescription. The timer offers a quiet space to practise; no particular session length guarantees a benefit.',
    links: [['NHS mindfulness guidance', 'https://www.nhs.uk/mental-health/self-help/tips-and-support/mindfulness/']],
  },
  sigh: {
    description: 'A gentle double inhale and an easy longer exhale, at your own pace.',
    guidance: 'Take a gentle inhale, then one small top-up only if comfortable. Let a longer exhale go without forcing. Take ordinary breaths whenever you like; there is no count or repetition target.',
    evidence: 'An adaptation of cyclic sighing, with no fixed seconds. The study used fuller breaths for five minutes daily over a month. This gentler version has not been separately tested and does not inherit the study’s results.',
    links: [structuredStudy, nhsBreathing],
  },
  custom: {
    description: 'Your own timing. Keep every breath comfortable.',
    guidance: 'Use “Adjust timing” to change the times. Pauses are optional. Let any cue pass or use Mindful for ordinary breathing with no pace to match.',
    evidence: 'These custom timings have no specific evidence claim. No medical or meditation standard makes one pace right for everyone, and the controls are not validated safety limits.',
    links: [nhsBreathing],
  },
};

function describeTechnique() {
  const key = settings.pacing === 'own' ? settings.practice : settings.preset;
  const note = techniqueNotes[key] ?? techniqueNotes.custom;
  $('technique-description').textContent = note.description;
  $('technique-guidance').textContent = note.guidance;
  $('technique-evidence').textContent = note.evidence;
  $('technique-links').replaceChildren(...note.links.map(([label, href]) => {
    const link = document.createElement('a');
    link.textContent = label; link.href = href;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    return link;
  }));
}
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
  document.querySelectorAll('button[data-practice]').forEach(button => button.setAttribute('aria-pressed', String(settings.pacing === 'own' && button.dataset.practice === settings.practice)));
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(settings.pacing === 'guided' && button.dataset.preset === settings.preset)));
  describeTechnique();
  const parts = [`${settings.inhale}s in`];
  if (settings.holdIn) parts.push(`${settings.holdIn}s hold after in`);
  parts.push(`${settings.exhale}s out`);
  if (settings.holdOut) parts.push(`${settings.holdOut}s hold after out`);
  const cyclesPerMinute = plan.cycleMs ? Number((60_000 / plan.cycleMs).toFixed(2)) : 0;
  $('pattern-summary').textContent = settings.pacing === 'own' ? '' : parts.join(' · ') + ` · ${cyclesPerMinute} guide cycles/min`;
  $('duration-note').textContent = settings.pacing === 'own' ? 'Timer only; no breathing pace to match.' : plan.durationMs === plan.requestedMs
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
  $('start').querySelector('span').textContent = ownPace ? 'Start quiet timer' : 'Start breathing';
  $('pause').hidden = !active;
  $('stop').hidden = !active;
  $('result').hidden = status !== 'complete';
  $('pause').textContent = status === 'paused' ? (ownPace ? 'Resume timer' : 'Resume guide') : (ownPace ? 'Pause timer' : 'Pause guide');
  $('progress').value = elapsedMs / plan.durationMs;
  $('session-clock').textContent = formatTime(frame.remainingMs);
  $('cycle-count').textContent = ownPace ? 'Your own rhythm' : settings.showSeconds && status === 'running' ? `Guide cycle ${frame.cycleNumber} of ${plan.cycles}` : 'Follow only if comfortable';
  const orb = $('breath-orb');
  if (status === 'running' && !ownPace) orb.style.setProperty('--expansion', frame.expansion);
  else if (status === 'idle') orb.style.setProperty('--expansion', 0);
  orb.dataset.phase = status === 'running' ? frame.phaseId : status;
  let label = 'Ready';
  let guide = ownPace ? (settings.practice === 'sigh' ? 'Gentle inhale, small top-up, easy longer exhale. Your own pace.' : 'Notice your breathing without trying to change it.') : 'Keep breaths easy. Join the guide only if comfortable.';
  let count = '';
  if (status === 'preparing') {
    label = 'Starting';
    guide = ownPace ? 'Nothing to match. Breathe in your own way.' : 'Breathe normally. Join any inhale when it feels easy.';
    count = settings.showSeconds && !ownPace ? Math.max(1, Math.ceil(readyRemainingMs / 1000)) : '';
  } else if (status === 'running' && ownPace) {
    label = settings.practice === 'sigh' ? 'Sigh gently, at your pace.' : 'Notice the breath.';
    guide = settings.practice === 'sigh' ? 'Easy inhale, small top-up, gentle longer exhale. Ordinary breaths whenever you need.' : 'Let it come and go. When attention wanders, gently return.';
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
    label = 'Paused';
    guide = 'Breathe normally. Resume or adjust the timing.';
  } else if (status === 'complete') {
    label = completedNaturally ? 'Session complete' : 'Session stopped';
    guide = 'Let your breathing return to its natural pace.';
    $('result-summary').textContent = elapsedMs < 1000 ? 'No practice time recorded.'
      : `${formatTime(elapsedMs)} ${ownPace ? 'at your own pace' : 'with the guide'}.`;
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
document.querySelectorAll('button[data-practice]').forEach(button => button.addEventListener('click', () => {
  settings = normalizeSettings({ ...settings, pacing: 'own', practice: button.dataset.practice });
  applySetup();
}));
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  const preset = PRESETS.find(item => item.id === button.dataset.preset);
  settings = normalizeSettings({ ...settings, ...preset, pacing: 'guided' });
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
  silence(); settings = { ...DEFAULTS }; configure(); notice('Slow & even restored: 5 seconds in, 5 out, without holds.'); save();
  const url = new URL(location.href); url.search = ''; history.replaceState(null, '', url);
});

let linkDialog;
$('share').addEventListener('click', async () => {
  if (!readTiming()) return;
  const url = new URL(location.href); url.search = ''; url.hash = '';
  url.searchParams.set('pacing', settings.pacing);
  if (settings.pacing === 'own') url.searchParams.set('practice', settings.practice);
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
if (migratedStarter) save();
