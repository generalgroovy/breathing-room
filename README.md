# Breathing Room

A little room to breathe: a gentle, customizable breathing guide with soft audio cues. Choose a rhythm, press **Start breathing**, and follow the expanding guide or the text.

**[Open the app](https://generalgroovy.github.io/breathing-room/)**

## Make the practice comfortable

- **Gentle, Even or Box** rhythms, plus custom inhale/exhale times of 2–10 seconds and optional pauses of 0–4 seconds.
- **1–20 minute sessions** that finish after a complete breath. Pause, resume or finish whenever needed.
- **Quiet synthesized cues:** a rising inhale, falling exhale and subtle pause/completion tones. Choose Warm bell or Soft tone, adjust volume, or practise silently.
- **A readable mobile layout**, keyboard controls, phase announcements and a still visual option that also respects reduced-motion preferences.
- **Settings saved on your device** and a session link for sharing a rhythm. No accounts, analytics, remote fonts or runtime dependencies.

Start with a short session and no pauses. Breathe comfortably rather than forcing a large breath; stop and return to natural breathing if dizzy or uncomfortable. This app supports a personal relaxation practice and does not measure health or provide treatment.

## Benefits and sources

Gentle breathing practice may help some people feel calmer and manage everyday stress. Effects vary, and research on specific methods has limitations; this app has not been clinically evaluated. The timings are adjustable guides, not a prescribed dose or a promise of a health outcome.

- [NHS: Breathing exercises for stress](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/) — comfortable, unforced breathing and regular practice.
- [NCCIH: Relaxation techniques](https://www.nccih.nih.gov/health/relaxation-techniques-what-you-need-to-know) — the evidence, its limitations, and when to discuss symptoms or complementary approaches with a health professional.

## Run and check

Use Node.js 22 or newer. No package installation is needed.

```sh
npm run dev
# Open http://127.0.0.1:8780/
npm test
npm run check
npm run build
```

In PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`. A different local port is available with `npm run dev -- --port 8781`. The preview binds only to your computer; use the published HTTPS app for a physical phone.

The build copies exactly nine runtime files into `dist/`. GitHub Actions checks tests, module syntax and the build before publishing `codex/initial` to Pages. Pull requests run checks without deploying; manual runs deploy only when that same branch is selected. The workflow uses pinned official actions and no dependency installation. Enable **GitHub Actions** as the repository's Pages source before the first deployment.

## Small, separate parts

| File | Responsibility |
| --- | --- |
| `model.mjs` | Normalize settings, build whole-breath plans and calculate the current phase from elapsed time. |
| `session.mjs` | Session lifecycle and monotonic timing, independent of rendering. |
| `audio.mjs` | `SoftAudio`: explicit-gesture `unlock()`, `cue(phaseId)`, `setVolume(0..60)`, `setTone('soft'\|'bell')`, `stop()` and `dispose()`. |
| `screen.mjs` | `StayAwake`: best-effort `acquire()` during a visible session and `release()` when it stops or pauses; pending requests cannot outlive that session. |
| `app.mjs` | Controls, preferences, display updates and browser lifecycle integration. |
| `index.html`, `styles.css` | Semantic interface and responsive presentation. |

Audio is silent until a user gesture unlocks it. `stop()` gently cancels current and scheduled tones and invalidates pending unlocks. A new gesture must unlock audio before it can play again. The `available`, `ready` and `status` properties let the interface recover without blocking a silent exercise.

## Browser boundaries

Keep the app visible while practising. During a session the app asks supporting browsers to keep the screen awake; the browser may refuse or revoke this, for example when battery power is low. It releases that request on pause or finish and does not reacquire it automatically. Sessions pause when the page is hidden; it does not promise lock-screen or background guidance. See the [MDN Screen Wake Lock reference](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) for browser requirements. Audio permission, interruptions and device volume depend on the browser and operating system. The on-screen guide remains usable if sound is unavailable.

After the page has loaded, timing, sound and settings work locally. There is no service worker or guaranteed offline reload/install experience. A manifest provides browser metadata; home-screen behavior varies by browser. Settings may be unavailable in restricted/private storage or cleared with browser data. Mobile layout checks do not replace trying real phone speakers, touch input and accessibility settings.
