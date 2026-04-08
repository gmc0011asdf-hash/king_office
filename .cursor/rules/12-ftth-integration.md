# Rule: FTTH Integration

## Scope
FTTH integration internals; UI-facing through Internet module.

## Allowed Edits
- Treat FTTH as part of Internet in UI contract.
- Keep FTTH internals isolated in integration layer.
- Prioritize detail/subscription/address enrichment over list-only fallback.

## Forbidden Edits
- Do not force list-only sync unless fast mode is explicitly enabled.
- Do not patch UI to hide backend data gaps.
- Do not leak FTTH internals to unrelated modules.

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
