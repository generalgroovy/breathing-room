# Breathing Room

A little room to breathe: an adjustable breathing guide with soft audio cues. Choose a guided pattern, observe your natural breath with **Mindful**, or explore the self-paced **Gentle sigh** adaptation.

**[Open the app](https://generalgroovy.github.io/breathing-room/)**

## Make the practice comfortable

- **Slow & even by default:** 5 seconds in and 5 seconds out, with no holds—six guided cycles per minute. **Longer out** uses 4 in / 6 out; **Box** uses four equal 4-second phases. Choose the pattern that feels comfortable, without treating a slower pace or longer hold as progress.
- **Mindful:** notice your natural breathing and gently return attention when it wanders. The timer does not prescribe a rhythm.
- **Gentle sigh:** a self-paced adaptation—a gentle inhale, a small second top-up if comfortable, then an easy longer exhale. Take ordinary breaths whenever needed; there are no prescribed phase seconds or maximum-volume instructions. The app does not claim the outcomes of the original cyclic-sighing research for this adaptation.
- **A still guide for self-paced techniques**, with no inhale, exhale or hold cues. A completion chime follows your sound preference. Each selected technique has a concise **Guide & research** section.
- **Make it yours:** custom guided inhale/exhale times of 2–6 seconds, with optional pauses of 0–4 seconds. These are product limits, not medically validated ranges.
- **1–20 minute sessions, starting at one minute.** Guided sessions finish a complete pattern; self-paced sessions end with the timer. The one-minute default is a convenient starting duration, not a research dose. **Breathe freely** stops the cues and freezes the guide. Resume when ready, or finish; editing a paused rhythm starts a new session.
- **Quiet synthesized cues** for guided practice: a rising inhale, falling exhale and subtle pause/completion tones. Choose Warm bell or Soft tone, adjust volume, or practise silently.
- **A readable mobile layout**, keyboard controls, phase announcements and a still display option that respects reduced motion. Phase seconds are hidden unless you choose to show them.
- **Settings saved on your device** and a session link for sharing a rhythm. No accounts, analytics, remote fonts or runtime dependencies.

Let the guide fit your breathing. You do not need a bigger breath, a slower pace or a longer hold. If matching the guide feels uncomfortable, choose **Breathe freely**, switch to **Mindful**, or stop. The orb is a timing illustration, not a target lung volume or a measurement of your breathing.

Saved legacy Easy 3/3 starter settings migrate once to Slow & even 5/5. Other selected rhythms and device preferences remain; an explicit 3/3 shared link still uses 3/3. Custom timing is still available.

## Benefits and sources

Breathing practice may help some people manage everyday stress, but research does not establish one best pace or inhale/exhale ratio for everyone. This app is informed by published guidance and research; it has **not been clinically evaluated or professionally medically reviewed**. It does not monitor oxygen, heart rate or carbon dioxide, and cannot establish whether an exercise suits an individual.

- [NHS: Breathing exercises for stress](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/) — comfortable, unforced breathing and regular practice.
- [NCCIH: Relaxation techniques](https://www.nccih.nih.gov/health/relaxation-techniques-what-you-need-to-know) — the evidence, its limitations, and when to discuss symptoms or complementary approaches with a health professional.
- [NHS: Mindfulness](https://www.nhs.uk/mental-health/self-help/tips-and-support/mindfulness/) — attending to present sensations, including the breath, without needing to change them.
- [Evidence and design notes](HEALTH.md) — primary research, comfort choices and the limits of the app's claims.

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
| `model.mjs` | Normalize settings, build guided or unpaced plans and calculate the current phase and visual timing from elapsed time. |
| `session.mjs` | Session lifecycle and monotonic timing, independent of rendering. |
| `audio.mjs` | `SoftAudio`: explicit-gesture `unlock()`, `cue(phaseId)`, `setVolume(0..60)`, `setTone('soft'\|'bell')`, `stop()` and `dispose()`. |
| `screen.mjs` | `StayAwake`: best-effort `acquire()` during a visible session and `release()` when it stops or pauses; pending requests cannot outlive that session. |
| `app.mjs` | Controls, preferences, display updates and browser lifecycle integration. |
| `index.html`, `styles.css` | Semantic interface and responsive presentation. |

Audio is silent until a user gesture unlocks it. `stop()` gently cancels current and scheduled tones and invalidates pending unlocks. A new gesture must unlock audio before it can play again. The `available`, `ready` and `status` properties let the interface recover without blocking a silent exercise.

## Browser boundaries

Keep the app visible while practising. During a session the app asks supporting browsers to keep the screen awake; the browser may refuse or revoke this, for example when battery power is low. It releases that request on pause or finish and does not reacquire it automatically. Sessions pause when the page is hidden; it does not promise lock-screen or background guidance. See the [MDN Screen Wake Lock reference](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) for browser requirements. Audio permission, interruptions and device volume depend on the browser and operating system. The on-screen guide remains usable if sound is unavailable.

After the page has loaded, timing, sound and settings work locally. There is no service worker or guaranteed offline reload/install experience. A manifest provides browser metadata; home-screen behavior varies by browser. Settings may be unavailable in restricted/private storage or cleared with browser data. Mobile layout checks do not replace trying real phone speakers, touch input and accessibility settings.
