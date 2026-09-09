# Dynamic conversation depth

Conversation depth is user-led state, not a turn limit. QUICK_REACTION / NORMAL / ENGAGED / DEEP are selected from local intent rules. Topic and recent question survive successive user turns and restart; discussion context expires after one day of inactivity. Explicit closing lowers depth. Existing material/goal/task context and moods remain separate, and ContextAssembler includes the detached conversation state.

Each user turn still produces a bounded character batch. No automatic character-only loop was added. Study, Reward, Bond, Memory and voice queue limits are unchanged. Thirty successive follow-up turns are covered by regression; no session or memory is created by discussion alone.

Limitation: this is local context-aware clarification, not general question answering. Scientific explanations, nuanced anaphora and deep semantic discussion are not supplied by the rules. No remote API was added. Android compilation/playback and visual QA remain unverified in this environment. Existing UI was not changed in this revision.
