# Character Continuity audit

Starting HEAD: 13fa79f08f05c9113ec9b19677530f5206449e40.
Design: GitHub issue #1. Preserve existing branch and RC signing; no automatic integration merge.
Verified baseline CI: 34699322961, regression 380/380, PersistenceQa 10/10, MigrationQa 9/9.
Emulator time-to-usable-chat: first launch 9020ms, restart 7845ms. These are individual CI samples, not physical-device measurements.

| Requirement | Before | Evidence / gap |
|---|---|---|
| Character authenticity | PARTIAL | Decisions precede wording; SAYO still offers Study CTA on casual turns after studying |
| Memory separation | PARTIAL | Three stores exist; router caller can bypass bound; goal authority reads nonexistent done field |
| Sequential dialogue | BROKEN | composeDialogue passes prior decision, not actual prior text (including lead override) |
| CastDirector | DONE | Deterministic ordered plans, direct mentions, max-three normal caller contract |
| Continuity | PARTIAL | Functional initiative wiring; context selection can mutate expiry during read |
| OpenThread | BROKEN | Ambiguous resolution closes latest topic; study completion incorrectly implies understanding |
| ReturnQueue | PARTIAL | Deferred real-session path exists; copy always says yesterday, authority not rechecked |
| RelationshipBehavior | PARTIAL | Thresholds permit one very long session to jump; metadata available to remote |
| RepetitionGuard | DONE | Structure persisted and changes cast rather than random synonyms |
| Fast startup | PARTIAL | Measured; advisory work deferred, but visit commit precedes first render |
| Persistence/migration | DONE | CI startup/restart, native 10/10 and migration 9/9; new fields additive |
| Tests | PARTIAL | 380 existing; missing adversarial actual-text, ambiguity and hard-bound tests |

DONE here describes inspected/tested software contracts, not subjective character feel or device validation.

## Checkpoint outcome and continuation

- Recall caps apply even to invalid caller limits; unknown authority references are not treated as verified facts. Goal completion uses progress/target. Session-memory writes use stable per-session identities and check corrected duration/end time.
- Local dialogue now passes the emitted prior text (including lead overrides) into the following reaction. Tests cover contradictory actual leads with unchanged decisions in both speaker orders. Existing pair tests now assert the actual-text contract rather than the defective decision-only contract.
- Group requests remain single requests, with bounded owner-separated memory slices for the planned cast. Direct-address plans cannot be expanded by repetition handling. Non-string remote message content is rejected.
- Open threads only resolve from explicit topic-specific positive acknowledgement, not generic acknowledgement or Study completion. Explicitly raised closed topics can reopen, preserving prior status without duplicating the topic.
- ReturnQueue session observations are rechecked against source state before delivery, and copy no longer invents yesterday after a longer absence. Relationship stages familiar/close require multiple actual study days.

| Requirement | Checkpoint status |
|---|---|
| Character authenticity | PARTIAL: casual after-study CTA removed; human character-feel QA outstanding |
| Memory separation | DONE for tested local ownership/bounds/authority contracts |
| Sequential dialogue | PARTIAL: actual-text local paths tested; live remote causal quality unverified |
| CastDirector | DONE for deterministic bounds and direct-address protection |
| Continuity / OpenThread | DONE for tested lifecycle/read-only selection contracts |
| ReturnQueue | DONE for tested delay/dedupe/source invalidation; live return feel unverified |
| RelationshipBehavior | PARTIAL: gradual thresholds corrected; local wording still uses only part of supplied relationship metadata |
| RepetitionGuard | DONE for existing structural contract; subjective variety unverified |
| Fast startup | PARTIAL: no optimization claimed; baseline 9020/7845ms, new emulator comparison blocked |
| Persistence/migration | PARTIAL for current branch: existing regression retained, new native CI replay blocked |
| Tests | Baseline 380/380. Added adversarial regression in continuity-audit.test.mjs; no existing test removed |

## External CI blocker

Run 34745220142 (5785d81) completed clean, assembleDebug, lintDebug, 387/387 regression and APK validation. Its first failing step is **Upload APK artifact**:
`Artifact storage quota has been hit. Unable to upload any new artifacts. Usage is recalculated every 6-12 hours.`
Run 34745354976 also failed at artifact upload. The persistence job depends on build artifacts, so current emulator APP_STARTUP / APP_RESTART / PersistenceQa / MigrationQa cannot run. Do not mark this green or change signing/workflow gates to hide the failure.

No artifacts, backups, branches or account settings were deleted/changed to make room. Possible cleanup candidates requiring user approval are intermediate analytics APK artifacts 10190370009 and 10190466228 (about 352 MB combined); final analytics artifact 10190523740 and frozen v0.7 artifact 10148421829 must remain. Cleanup may not suffice for the account-wide quota, and GitHub may take 6-12 hours to recalculate.

After capacity is available, rerun the unchanged pipeline, inspect the first actual error, then compare startup samples. Keep signing secrets private. Do not merge into android-v08-integration until every required gate passes. Physical-device startup feel, character feel, audible voice, remote latency, real Usage/WorkManager/notification timing, saved-data reopen and visual QA remain NOT VERIFIED.
