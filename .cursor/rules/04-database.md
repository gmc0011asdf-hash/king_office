# Rule: Database

## Scope
SQLAlchemy models, migrations, and persistence logic.

## Allowed Edits
- Prefer additive/backward-compatible changes.
- Document source -> normalized -> persisted mapping.
- Keep null/fallback rules explicit.

## Forbidden Edits
- No destructive schema changes without explicit plan.
- No broad update scripts in hotfix tasks.

## Mandatory Workflow
- Map fields before edits.
- Validate conversion/nullability behavior.
- Provide verification queries.

## Output Format Before Implementation
- Changed tables/columns.
- Write-path summary.
- Validation query list.
