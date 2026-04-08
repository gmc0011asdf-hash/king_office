# Rule: Notifications

## Scope
Notification triggers and delivery.

## Allowed Edits
- Edit only this module unless shared contract change is documented.
- Preserve Arabic RTL behavior in user-facing outputs.
- Keep interfaces stable for dependent modules.

## Forbidden Edits
- No cross-module refactor from this rule context.
- No unrelated API or schema changes.
- No hidden contract drift.

## Mandatory Workflow
- Identify ownership boundary.
- List upstream/downstream dependencies.
- Patch local scope minimally.
- Verify no adjacent regression.

## Output Format Before Implementation
- Module scope confirmation.
- Exact files and reasons.
- Cross-module impact note.
- Validation steps.
