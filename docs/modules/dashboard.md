# Module: Dashboard

## Owner Boundary
KPI and overview surfaces

## Isolation Rules
- Keep module logic local
- Avoid cross-module edits without explicit contract note
- Preserve Arabic RTL behavior for all user-facing outputs

## Safe Change Guidance
- Identify upstream/downstream dependencies before edits
- Patch nearest responsible component/service
- Validate neighboring module behavior is unchanged
