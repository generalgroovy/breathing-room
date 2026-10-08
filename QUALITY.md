# Release checks

## 1.1.0 — comfort and pacing refinement

Checked on 8 October 2026. The 1.0.0 results below are preserved as historical evidence; the checks here cover the updated implementation.

The update changes the default to one minute of Easy (3 seconds in / 3 seconds out), adds an unpaced Own rhythm option, moves Box into optional customization, and reduces custom inhale/exhale limits to 2–6 seconds. Phase seconds become optional. The visual guide uses smoother movement, and Breathe freely stops cues and freezes the guide. Editing a paused rhythm resets a new session.

- **67 automated tests pass:** 23 model, 23 session, 11 audio and 10 screen wake-lock tests. New cases cover unpaced timing, absence of prescribed phases, unchanged elapsed time on unpaced resume, updated preference bounds and smooth visual turning points.
- Nine module syntax checks, runtime references, unique IDs, relative manifest checks and the nine-file build pass.
- Real-browser sessions completed one minute each in Own rhythm and the new Easy guided mode. Own rhythm showed a stationary orb, no phase number and no guided cycle count. Optional phase seconds worked in Guided.
- Breathe freely froze the current orb size and enabled timing edits. A changed rhythm prepared a fresh session with an explicit notice. An invalid paused edit blocked Resume and focused the input; Stop remained immediately usable.
- Box stayed under customization. Remove holds cleared both hold fields and restored keyboard focus. Previously stored preferences restored, old 10-second link values became the current 6-second maximum, and Own rhythm links exported only pacing and duration.
- Independent code review checked mode-specific sound wording, own-mode continuation after optional audio interruption, cue cancellation, keyboard recovery and preparatory opacity transitions.
- A 320-pixel mobile viewport showed no horizontal overflow. The initial action and pacing choice remained accessible with touch-sized controls.

The publishing workflow repeats the software checks before deployment. Public file correspondence and live smoke checks are recorded separately at release time; no clinical inference follows from a matching file or successful deployment.

[HEALTH.md](HEALTH.md) records the sources checked on 8 October 2026 and the design rationale. This is a source-based product review, **not professional medical review or clinical validation**. No check in this file establishes medical safety, a therapeutic dose or health benefits for an individual.

## 1.0.0 — historical release checks

Checked on 8 October 2026. These checks establish implementation behavior, not medical effectiveness.

### Automated checks

- 58 passing Node tests: settings and whole-cycle plans (17), session timing and interruptions (20), audio envelopes and cancellation (11), screen wake-lock lifecycle (10).
- Nine module syntax checks, module/runtime references, unique HTML IDs, and repository-relative manifest checks pass.
- Explicit build contains nine runtime files. Tests, documentation and Git data are excluded.
- Preview server checks cover byte correspondence, content types, HEAD, method rejection, private/traversal path rejection and Host validation.
- Independent review covered session recovery, asynchronous audio/wake-lock cancellation, storage failure notices and completion focus.

### Browser checks

Performed in a Chromium-based browser using the real controls:

- A one-minute gentle session completed its six full breaths and showed the completion state.
- Pause/resume repeated the current breath from its inhale after a three-second preparation.
- Box rhythm, optional holds, early finish, live sound toggle, cue preview and still display worked.
- Custom timing fields updated the rhythm summary; empty required fields prevented starting and focused the invalid field.
- A custom shared rhythm loaded correctly, including a two-minute length; copying the session link reported success.
- Settings persisted across reload, and Reset restored the gentle defaults.
- Layouts at 320 × 780, 390 × 844 and 1280 × 900 had no horizontal overflow. Phone inputs use 16px text, and the first action remains prominent.
- Final integrated browser session produced no console errors or warnings.

### Acceptance boundaries

Physical iOS/Android touch, speaker volume, listening comfort and assistive-technology behavior still need real-device use. Screen wake locks are best effort; their availability and revocation depend on the browser and device. The test browser kept its document visible when its panel was hidden, so an actual phone lock/background transition was not reproduced there. Interruption handling is covered by clock and resource-lifecycle tests and code review.

There is no guaranteed offline reload or lock-screen/background audio. The app has not been clinically evaluated. Health copy links to NHS, NCCIH and primary research and avoids prescribing a supposedly optimal rhythm.

The publishing workflow must pass these checks before Pages deployment. A successful deployment alone does not establish physical-device or health outcomes.
