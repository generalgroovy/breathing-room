# Release checks — 1.0.0

Checked on 8 October 2026. These checks establish implementation behavior, not medical effectiveness.

## Automated checks

- 58 passing Node tests: settings and whole-cycle plans (17), session timing and interruptions (20), audio envelopes and cancellation (11), screen wake-lock lifecycle (10).
- Nine module syntax checks, module/runtime references, unique HTML IDs, and repository-relative manifest checks pass.
- Explicit build contains nine runtime files. Tests, documentation and Git data are excluded.
- Preview server checks cover byte correspondence, content types, HEAD, method rejection, private/traversal path rejection and Host validation.
- Independent review covered session recovery, asynchronous audio/wake-lock cancellation, storage failure notices and completion focus.

## Browser checks

Performed in a Chromium-based browser using the real controls:

- A one-minute gentle session completed its six full breaths and showed the completion state.
- Pause/resume repeated the current breath from its inhale after a three-second preparation.
- Box rhythm, optional holds, early finish, live sound toggle, cue preview and still display worked.
- Custom timing fields updated the rhythm summary; empty required fields prevented starting and focused the invalid field.
- A custom shared rhythm loaded correctly, including a two-minute length; copying the session link reported success.
- Settings persisted across reload, and Reset restored the gentle defaults.
- Layouts at 320 × 780, 390 × 844 and 1280 × 900 had no horizontal overflow. Phone inputs use 16px text, and the first action remains prominent.
- Final integrated browser session produced no console errors or warnings.

## Acceptance boundaries

Physical iOS/Android touch, speaker volume, listening comfort and assistive-technology behavior still need real-device use. Screen wake locks are best effort; their availability and revocation depend on the browser and device. The test browser kept its document visible when its panel was hidden, so an actual phone lock/background transition was not reproduced there. Interruption handling is covered by clock and resource-lifecycle tests and code review.

There is no guaranteed offline reload or lock-screen/background audio. The app has not been clinically evaluated. Health copy links to NHS, NCCIH and primary research and avoids prescribing a supposedly optimal rhythm.

The publishing workflow must pass these checks before Pages deployment. A successful deployment alone does not establish physical-device or health outcomes.
