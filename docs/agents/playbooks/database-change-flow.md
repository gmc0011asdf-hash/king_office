# Playbook: Database Change Flow

1. Define source -> normalized -> persisted field mapping.
2. Validate nullability/fallback handling.
3. Prefer additive schema evolution.
4. Verify read/write paths and index impact.
5. Provide verification queries and rollback notes.
