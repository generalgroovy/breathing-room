# Evidence and comfort choices

Sources checked **2026-10-08** for Breathing Room 1.1.0.

Breathing Room offers a visual/audio guide or an unpaced timer for a personal relaxation practice. The design uses published guidance and research, but **the app has not been clinically evaluated or professionally medically reviewed**. Reading studies, reviewing code and passing software tests do not establish medical safety or effectiveness.

## Using the guide

Choose a comfortable position and let breathing stay easy and unforced. A larger orb does not ask for a larger breath. There is no score for matching it, slowing down or holding longer. **Breathe freely** stops cues and freezes the guide; **Own rhythm** provides quiet time without inhale/exhale instructions.

If practice makes you dizzy, uncomfortable or more distressed, stop and return to your usual breathing. Ongoing or concerning symptoms deserve advice from a health professional rather than attempts to fix them with a timer. This approach follows the emphasis on comfort in [NHS breathing guidance](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/) and the limitations and possible adverse experiences described by [NCCIH](https://www.nccih.nih.gov/health/relaxation-techniques-what-you-need-to-know).

## What the sources support

| Source | Finding or guidance | How it informs this app |
| --- | --- | --- |
| [NHS: Breathing exercises for stress](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/) | Describes comfortable, gentle breathing without forcing it; counting is optional and a person may not reach the suggested count initially. | The user can choose a pace, omit phase seconds, take a break or practise without pacing. The one-minute default is an introduction to the controls, not an NHS-prescribed treatment dose. |
| [NCCIH: Relaxation techniques](https://www.nccih.nih.gov/health/relaxation-techniques-what-you-need-to-know) | Evidence varies by technique and condition. Some people experience increased anxiety or other unwanted experiences during relaxation practices. | No guaranteed outcomes or suitability claims. Keep stopping easy and avoid telling someone to persist through discomfort. |
| [Cambridge University Hospitals: Hyperventilation information](https://www.cuh.nhs.uk/patient-information/breathing-exercises-in-the-treatment-of-hyperventilation/) | Explains that over-breathing relative to the body's needs can lower carbon dioxide and cause symptoms including dizziness and tingling; it discusses gentle, comfortable breathing. | Do not prompt oversized breaths or treat a slower timer as proof of appropriate ventilation. This app does not diagnose or treat hyperventilation; the leaflet concerns a clinical context and is not adopted as an app treatment protocol. |
| [Fincham et al., 2023: Breathwork meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC9828383/) | Twelve randomized trials with 785 adults contributed to the stress analysis. The pooled result favored breathwork by a small-to-medium amount, with moderate risk of bias in most studies. | “May help with everyday stress” is a cautious description of the broader research. It does not establish a benefit from this implementation, its defaults or a single session. |
| [Fincham et al., 2023: Coherent-breathing controlled trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC10719279/) | In 400 participants, about 5.5 breaths/minute did not outperform a matched 12-breath/minute comparison for the primary stress outcome after roughly 10 minutes/day for four weeks. | A slower rhythm is a preference, not a superior mode. This result does not establish that all paces are equivalent or suitable for everyone. |
| [Birdee et al., 2023: Extending the exhale](https://pmc.ncbi.nlm.nih.gov/articles/PMC10395759/) | A 12-week randomized comparison in healthy adults did not find a statistically significant stress-reduction advantage for a longer exhale over equal inhale/exhale timing. | Long out is an optional pattern. The app does not claim that its ratio is optimal, medically superior or a proven way to change autonomic function. |

These are selected sources relevant to the product choices, not a systematic clinical review or an endorsement by the named organizations. The following choices are design judgments informed by those sources; none was clinically tested in this app.

## Why the controls work this way

- **Easy starts at 3 seconds in / 3 seconds out for one minute, without holds.** It is a short introduction with fewer demands than the previous default. Its name does not mean the pace will be easy for every person; Own rhythm is equally prominent.
- **Own rhythm does not set a breathing rate.** The orb stays still and inhale, exhale and hold sounds are absent. A completion chime can play if sound is enabled. The session timer measures time spent, not breaths or a health outcome.
- **Holds and Box are optional.** Custom inhale/exhale controls run from 2–6 seconds and each hold from 0–4 seconds. These are product boundaries, not validated safe or therapeutic ranges. Combining the maxima makes a 20-second cycle, which can still be uncomfortable or unsuitable; shorter allowed values are not guaranteed suitable either.
- **The guide is illustrative.** The smoother cosine-shaped visual transition is an animation choice. Orb size and motion do not represent lung volume, airflow, oxygen, carbon dioxide, heart rate or nervous-system activity. Phase seconds are hidden by default to reduce the demand to match a countdown.
- **A break removes the pace immediately.** Breathe freely stops phase cues and freezes the orb. Resuming a guided pattern begins with a fresh preparation; changing a paused rhythm resets a new session so progress is not attributed to a different plan.

## Boundaries of what the app knows

The app has no physiological sensors or oxygen, heart-rate or carbon-dioxide monitoring. It cannot identify over-breathing, determine a user's medical status, choose an individually appropriate pace or confirm that breathing matched the guide. It cannot guarantee medical safety, treat symptoms or replace professional care.

The test and browser results in [QUALITY.md](QUALITY.md) describe software behavior. Physical-device comfort, individual experience, professional medical review and clinical outcomes remain separate questions.
