# Character Room Lab integration

Status: implementation branch `android-v08-character-room-lab`

Source of truth for adopted character design: `juncarly-bot/local-character-lab`.

## Scope

This integration ports the adopted Character Room Lab v1 character behavior into the cumulative Android line without replacing StudySession or the existing study domain.

Implemented in this branch:

- Character Profile with numeric Personality and Conversation Behavior
- Speech Style as identity + tendencies + examples + hard/soft guidance
- directional Relationship axes: Familiarity / Affection / Trust / Comfort + temporary Tension
- Affection constrained to 0-100
- Interaction Event deltas with per-segment anti-farming cap
- continuous Mood axes: Valence / Energy / Social Energy / Sleepiness
- Desire list
- SLEEP / FREE life cycle
- IN / OUT Presence and maximum four active room participants
- explicit user invitation / exit controls
- Interest and Expertise as separate values
- Knowledge Access and Expertise-based depth guard
- shared Conversation Analysis
- Conversation Acts
- Topic Lifecycle with novelty and engagement
- Conversation Seeds with the six adopted source classes
- personal Memory semantics through `knownBy`
- runtime Character context passed to the remote dialogue provider
- Profile / Runtime / Relationship / Memory / Desire / Seed inspection in the Android Character screen
- Developer-mode Character Engine snapshot

Existing continuity, commitment, initiative, StudySession, separated character memory, Remote-only response replacement and voice contracts remain in place.

## State ownership

```
Study domain (authoritative)
  StudySession / goals / materials / tasks / usage
             |
             v
Character Engine (reactive)
  Profile -> Mood -> Desire -> Director hint
       |       |        |
       +-> Relationship |
       +-> Knowledge ---+
       +-> Speech Style
             |
             v
        Dialogue context
```

`state.characterEngine` is additive. Old backups that do not contain it receive deterministic defaults during validation/migration.

## Runtime budget

The implementation keeps the current foreground budget at one remote generation call per planned group turn. Character analysis, relationship bounds, mood evolution, life state, presence, knowledge depth and seed bookkeeping are deterministic local code.

This preserves the Lab principle:

```
code -> structured character context -> main generation model
```

rather than spending separate LLM calls for every subsystem.

## Deliberately not promoted

`notes/2026-09-17-character-goals.md` is explicitly a design memo and is not part of the canonical v1 specification. Character Goal is therefore not persisted or used by the runtime in this branch.

The Lab Model Library and News Collector documents describe platform/model infrastructure. The character-facing integration points are present here (manual runtime remains model-independent; News is an accepted Seed source), but native model download/runtime management and a network News Collector are separate infrastructure work and are not silently added to this Android character patch.
