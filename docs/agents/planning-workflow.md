# Planning Workflow

This file is a repo-local pointer to the bundled planning workflow template at `~/.codex/skills/moenarch-setup-agent-loop-skills/planning-workflow.md`.

Repo-specific rules:

- GitHub Issues are the durable work queue for this repository.
- Substantial future work should default to a GitHub PRD issue instead of direct implementation.
- PRD issues must be labeled `prd` and should receive `ready-for-agent` only when they include acceptance criteria and out-of-scope boundaries.
- Implementation slice issues must include a `## Parent` link to their parent PRD before they receive `ready-for-agent`.
- The planning thread should stop after creating the PRD issue unless the user explicitly asks for direct implementation.
- The planning thread should not create implementation slice issues by default; `moenarch-agent-loop` or a later `moenarch-to-issues` pass handles slicing.
- Tiny one-shot changes may be implemented directly.
- Explicit user direction to implement directly wins over the default.
