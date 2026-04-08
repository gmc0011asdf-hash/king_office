# Rule: Debug

## Scope
Diagnosis and runtime troubleshooting tasks.

## Allowed Edits
- Gather evidence from logs and runtime behavior first.
- Use targeted debug logs where needed.

## Forbidden Edits
- No speculative rewrites without evidence.
- No retry loops without new signal.

## Mandatory Workflow
- Reproduce issue.
- Locate first incorrect transform.
- Patch and verify with before/after evidence.

## Output Format Before Implementation
- Symptom evidence.
- Root cause.
- Fix proof.
