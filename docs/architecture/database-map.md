# Database Map

## Data Path (FTTH example)
external payload -> unified normalization -> ftth_external_data -> ftth_customers projection

## Guardrails
- Keep mappings explicit and auditable
- Prefer additive evolution
- Validate null/fallback behavior for display-critical fields
