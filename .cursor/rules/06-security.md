# Rule: Security

## Scope
Auth, permissions, external integrations, and secret handling.

## Allowed Edits
- Preserve authz/authn checks.
- Mask sensitive values in logs.
- Validate external inputs and trust boundaries.

## Forbidden Edits
- No secret exposure in code/docs.
- No weakened permission checks.

## Mandatory Workflow
- Review access paths touched.
- Confirm no sensitive leakage.
- Confirm least-privilege behavior.

## Output Format Before Implementation
- Security impact.
- Data exposure check.
- Permission check status.
