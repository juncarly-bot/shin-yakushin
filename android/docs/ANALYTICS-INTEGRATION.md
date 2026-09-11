# Analytics / backup integration (parallel branch)

Base: `75fbb06ba91e4ba9cd955fcb62a8b053fbd05147`, successful run 34574202245.
Branch: `android-v08-analytics-backup`. Do not merge automatically.

## Storage and APIs

Core schema stays **2**. Optional root `lifeBalanceAnalytics` is `{version:1, days:[DailyAggregate]}`.
`dailyAggregate` accepts only whitelisted daily totals and bounded observation windows, a civil date and IANA timezone. No raw UsageEvent or installed-app list is stored by this API.
`StudyApplication.recordDailyAggregate(input)` uses the existing native revision CAS. It validates before commit and publishes only a validated successful result. It does not call the reaction director or change Study/Reward/Bond/Memory. Equal snapshots cause no writes. Invalid existing analytics blocks analytics writes, not app load. No automatic repair overwrites an invalid ledger.
`upsertDaily` replaces cumulative same-day totals, never adds them. Overlapping dates, changed timezone/start for an existing date, stale observations and clock rollback are rejected. Original history is retained. A timezone change can leave a gap until a non-overlapping day; do not silently remap historical data.
`normalizeLedger` is a read-only analytics projection; invalid rows are omitted with `rejectedCount`. The saved raw section remains untouched on load/restore.

`complete=true` requires midnight-to-midnight boundaries in the supplied timezone. DST days can be 23 or 25 hours. Partial days must remain false. Goal/budget success days count complete days only. Unknown budgets and UNLIMITED are excluded from budget-success denominators.
`categoryCoverage=false` means study-app/neutral breakdown was unavailable. Do not interpret their placeholder zero totals as measured zero.

## Real-data merge points for DeepSeek

The existing `platformDailyBalance` callback saves **partial current-day snapshots** using `aggregateFromSnapshot`; only explicit UI refreshes currently persist observations. No background worker or notification code is changed here.
The current native snapshot lacks study/neutral category totals and final historical-day coverage. To populate full weekly history, supply finalized daily aggregates from a local historical query with:
- `date`, `timeZone`, `startMs`, `endMs`, `observedAt`, `complete`
- Study minutes and explicit minute goal (read-only StudySession mapping)
- category minute totals, mode and historical budget
- intervention/recovery counts from the authoritative intervention store
Never mark yesterday's last partial observation complete merely because midnight passed. Requery a bounded historical day or leave it partial. Missing days are unknown, not zero.
Background native writes should use the same StateStore revision CAS and preserve every unknown root field; coordinate the final writer rather than adding a second independent ledger.
`recoveryAnalytics(interventions,sessions,options)` consumes minimal `{id,timestamp}` events and existing StudySessions transiently; each session and intervention contributes at most once. It returns IDs for analysis only. It does not post notifications or award Reward/Bond. Callers dedupe authoritative intervention IDs and pass successful local interventions, not arbitrary remote text.

## Weekly / conversation

`weeklySummary(ledger,monday)` produces seven-calendar-day totals, coverage, averages over observed days, mode distribution and absolute deltas. Both weeks must have seven complete days for comparison. `behaviorInsights` requires >=10 complete days, >=5 samples in each comparison group; wording explicitly denies established causality.
No late-entertainment or planned-delay insight is inferred without source data. First-study-start is a local minute bucket, not a foreground timeline.
`weeklyContext` whitelists totals and selected insights. ContextAssembler only includes it for anchored weekly questions and the existing usage-conversation preference. No speaker authority is transferred. Local conversation replies work without backend access. UI: More -> weekly life balance; sparse/partial coverage is explicit.

## Backup / compatibility

Existing full-state native export already includes settings and optional aggregate history. Existing previewImport/restore uses staged migrate/validate and native pre-import backup; no second backup format or storage key is introduced.
`compatibleLifeBalance` repairs malformed known optional values, unknown enums to NORMAL/NEUTRAL, and corrupt booleans to false. It preserves valid missing optional fields/unknown extensions for compatibility; consumers can request a fully defaulted view. Missing whole settings uses the existing fresh defaults. Missing installed packages are retained as classification keys.
Core validation remains strict. No saved data is deleted or initialized by this change. Broken JSON/core remains a load failure with original preserved.

## Shared files / recommended merge

New independent modules: `life-balance-analytics.js`, `life-balance-compat.js`; three test files; this note; dedicated build-only `android-v08-analytics.yml` (separate artifact name).
Small shared hooks:
- domain.js: optional LifeBalance compatibility migration only
- platform.js: `recordDailyAggregate` method
- MainActivity.java: add two exact asset allowlist entries only
- ui.js: weekly screen, snapshot callback save, pass userMessage to ContextAssembler
- conversation.js: local weekly-question resolution
- companion.js: optional readonly weekly context

Merge DeepSeek's runtime work first, then these additive hooks. Review ui.js and companion.js manually if both branches edited minified lines. Keep DeepSeek's real Usage/coaching implementation, worker, notification scheduling and deep link. No edits here to life-balance.js coachingDecision, LifeBalanceSnapshot, WorkManager, notifications, existing CI workflow, backend, JNI/audio or styles. Baseline branch/artifact remains frozen.

## Verification limits

Node regression covers core compatibility, aggregate CAS/rollback, source preservation, week boundaries/DST, local conversation and remote payload privacy. This is not Android SQLite/device proof. Physical saved-data reopen, actual UsageStats, UI rendering on device, notification and audible VOICEVOX remain NOT VERIFIED on this branch. Emulator expansion is intentionally outside this parallel task.

## Live overlap check

Compared against runtime branch `ca5aa31a6c4daa0a35bf17617ca846a52d789834` during this session. Shared changed files are **ui.js, domain.js, MainActivity.java**.
- ui.js has a genuine same-line conflict in `platformDailyBalance`: keep DeepSeek's `applyCoaching()` and then save the aggregate through the current `app`/`S`. Catch analytics failures independently so they do not suppress coaching. Preserve DeepSeek's launch/resume refresh hooks.
- domain.js changes are separate: retain its `intervention` action and this branch's compatibility import/migration.
- MainActivity changes are separate: retain its notifier/scheduler initialization and this branch's two additional asset paths.
No merge has been performed. Rerun combined regression/build after manual integration; branch-local green CI is not proof of a merged build.
