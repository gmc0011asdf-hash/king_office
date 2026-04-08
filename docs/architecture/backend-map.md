# Backend Map

## Main Areas
- Routers: HTTP boundary and contract
- Services/Integrations: business logic and external API handling
- Models/Schemas: persistence and data contracts

## Guardrails
- Trace route -> service -> persistence for diagnosis
- Keep API shapes stable unless requested
- Add explicit logs for fallback/branch decisions
