# Quality checks

- Keyboard: all primary interactive controls are native buttons or links with visible browser focus.
- Motion: 2D control center is always available; the 3D route identifies its 2D fallback.
- Security: API boundaries require sessions and workspace membership; artifact storage keys are omitted from API responses.
- Privacy: provider fixtures redact credential-shaped values; client event payloads use safe summaries.
- Performance: Three.js is isolated to `/office/scene`, so regular control-center pages do not load its scene bundle.
- States: sign-in, unauthorized response, active task, waiting input, completed artifact and offline sync copy are represented in current UI/API contracts.
