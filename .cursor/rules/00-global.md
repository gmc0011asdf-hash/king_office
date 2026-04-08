# Rule: Global

## Scope
Applies repository-wide to all modules and layers.

## Allowed Edits
- Keep changes minimal and reversible.
- Preserve Arabic RTL labels, order, and direction behavior.
- Reuse existing architecture and helpers before adding new paths.

## Forbidden Edits
- No unrelated refactors.
- No behavior changes outside requested scope.
- No secret handling changes unless requested.

## Mandatory Workflow
- Diagnose first.
- State root cause.
- Implement smallest safe patch.
- Run focused validation.

## Output Format Before Implementation
- Root cause bullets.
- Exact files planned.
- Risk note.
- Validation steps.
