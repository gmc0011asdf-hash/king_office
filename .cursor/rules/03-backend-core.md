# Rule: Backend Core

## Scope
FastAPI routers, services, and integrations.

## Allowed Edits
- Reuse existing service flows and schemas.
- Keep endpoint contracts stable by default.
- Add clear logs on new decision/fallback points.

## Forbidden Edits
- No auth/permission bypasses.
- No breaking response shape changes unless requested.

## Mandatory Workflow
- Trace route -> service -> persistence.
- Patch nearest responsible layer.
- Compile/lint targeted files.

## Output Format Before Implementation
- Root cause chain.
- Changed endpoints/services.
- Persistence impact notes.
