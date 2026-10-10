# Release checks

## 1.3.0 — direct controls and session states

The interface uses a single breathing circle, flat surfaces and specific labels: Adjust timing, Safety & evidence, Paused, Session complete and Session stopped. Decorative rings and slogans were removed. Existing technique timing, research links, comfort guidance, optional pauses, audio cues and reduced-motion behavior are unchanged.

All 74 automated tests, module checks and the nine-file build pass. Rendered acceptance and exact public-file verification are recorded separately in the release evidence for 10 October 2026.

## 1.2.0 — technique selection and research context

Checked on 8 October 2026. The earlier results below are preserved as historical evidence.

The candidate defaults to Slow & even (5 seconds in / 5 seconds out), with visible Longer out, Box, Mindful and Gentle sigh choices. Mindful is unpaced observation; Gentle sigh is explicitly a self-paced adaptation with no phase-second prescription or claim to reproduce the original research protocol. The chosen technique has its own Guide & research section. The one-minute starting duration remains independent of technique.

- **74 automated tests pass:** 30 model, 23 session, 11 audio and 10 screen wake-lock tests. New cases cover the exact legacy migration, preserving explicit timings, versioned settings and the two self-paced practices. Existing interruption, completion and cue-cancellation checks pass.
- Nine module syntax checks, runtime references, unique IDs, relative manifest checks, whitespace checks and the nine-file build pass.
- Real-browser checks covered all five choices, their selected state and technique-specific guidance. Mindful completed a one-minute timer with a stationary orb and no phase count. Gentle sigh used the same unpaced display with its distinct instructions and immediate Stop. Box could be paused and its holds removed, restoring input focus.
- Slow & even completed a full one-minute guided session at 5/5 and displayed the natural completion state after its final exhale.
- The browser's existing Easy preferences migrated to 5/5 with an explanatory notice. A deliberately opened 3/3 link stayed at 3/3 after saving and returning without query parameters. A link with `pacing=own&practice=sigh` correctly selected Gentle sigh; preset buttons returned to guided mode.
- Copying reported success and the URL construction was independently reviewed. The automation clipboard reader returned a stale prior link, so this run does not establish native clipboard correspondence.
- Keyboard activation selected Longer out. At 320 × 780, the page had no horizontal overflow and all five controls remained readable and at least 60 pixels tall. The desktop layout at 1280 × 900 kept the primary action and technique choices visible. No browser console errors or warnings appeared in the checked flows.
- Independent model/controller and interface review found no remaining consequential defect. Own-mode summaries avoid division by zero; a migration save failure keeps its storage warning visible.

The publishing workflow repeats the software checks before deployment. Public file correspondence and live smoke checks are recorded separately at release time; software evidence does not establish clinical or physical-device acceptance.

The source review is recorded in [HEALTH.md](HEALTH.md), checked 2026-10-08. Professional medical review, clinical evaluation and physical-device acceptance remain unperformed unless independently documented; software checks do not establish those outcomes.

## 1.1.0 — historical comfort and pacing refinement

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
