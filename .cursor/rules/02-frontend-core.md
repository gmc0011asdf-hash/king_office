# Rule: Frontend Core

## Scope
React/TypeScript frontend under src.

## Allowed Edits
- Edit only impacted components/hooks/types.
- Keep existing UI contracts and fallback behavior.
- Preserve RTL and Arabic text exactly unless requested.

## Forbidden Edits
- No global redesign during bug fixes.
- No cross-module rewrites from UI layer.

## Mandatory Workflow
- Trace UI state/data source.
- Patch minimal rendering/data binding.
- Verify table order and fallback markers.

## Output Format Before Implementation
- UI impact summary.
- Files/components touched.
- How to verify visually.
