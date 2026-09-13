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
