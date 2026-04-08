# Agent Instruction System Index

## Purpose
A structured multi-agent system for diagnosis-first, minimal-safe fixes, strict module isolation, and maintainable delivery.

## Layout
- `.cursor/rules/`: execution constraints and required output format.
- `docs/agents/prompts/`: ready Claude Code prompts by domain.
- `docs/agents/playbooks/`: repeatable operating procedures.
- `docs/modules/`: module boundary references.
- `docs/architecture/`: system maps and environment map.

## Priority
1. Global/workflow rules
2. Layer rules (frontend/backend/database/debug/security/testing)
3. Module rules
4. Playbooks and prompt templates

## FTTH Contract
- UI perspective: FTTH is inside Internet module UX.
- Internal architecture: FTTH remains isolated integration layer.
