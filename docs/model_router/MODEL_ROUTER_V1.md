# Model Router V1

STATUS=LOCAL_SYNTHETIC_CONFIG_ONLY

The Model Router chooses a configured model profile from task type, risk, cost posture, and provider availability.

Routing rules:

- critical tasks use the best available synthetic profile;
- routine tasks use the cheaper profile;
- classification uses deterministic code first, then cheap fallback if needed;
- coding routes to the contract-only Claude Agent SDK or Codex worker profile;
- review uses a different provider profile or independent run;
- unknown task types are denied by safe default;
- when AI providers are unavailable, deterministic fallback continues where possible.

No live providers are enabled. No provider credentials are committed. All provider profiles are local/synthetic or contract-only.
