# Conversation Continuity

Conversation is a thin continuity layer around Study. It does not own StudySession, Reward, Relationship, or Memory.

## State lifetime

| Lifetime | Stored information |
|---|---|
| Temporary (up to one day) | last six user/character turns and recent reaction |
| Session context (up to seven inactive days) | topic, Material/Goal/Task IDs, intent, speaker, emotional state |
| Long-term Domain | StudySession history, progress events, Relationship metrics, bounded important Memory |

Short conversational details are never promoted automatically into Memory. `recentRelevantMemoryId`, recall time, and reaction budget only prevent repetition; a pruned automatic Memory may safely leave a cooldown ID.

## Continuation resolution

`ConversationState`, finished StudySessions, active Daily Plans, and explicit title hints produce ranked candidates. A strong current topic or a single clear candidate starts through the ordinary `start` Domain command. Close candidates produce a short choice and do not create a session. Every start still receives a fresh session ID and uses the existing StudySession path.

## Recall policy

Memory candidates combine entity/topic relevance, importance, current event fit, age, prior use, and accumulated Study relationship. Recall requires a 24-hour global cooldown and at least three ordinary reactions since the previous recall. Unrelated Memory has zero relevance. Recalled text is selected before `VoiceProvider`; VOICEVOX contains no dialogue logic.

## Emotion and identity

`CharacterState` persists calm, focused, pleased, proud, relaxed, concerned, or tired-context for three minutes and uses allowed transitions. Character Profiles centralize role, language tendency, relationship distance, Memory tendency, and voice style. Local and future remote DialogueProviders receive detached copies through `ContextAssembler`.

## UX operations

- Home → previous Study: one tap.
- Home → Free Study: one tap from the continuation card, or one primary tap when no continuation exists.
- Finish → progress → Home: one quick increment and one completion tap; progress is optional.
- Ambiguous text: one short choice, then the ordinary Study start.

Home keeps reaction, continuation, today plan, start, and today summary in that order. Chat history is collapsed; conversation stays part of the Study experience.
