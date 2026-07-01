# Agent Task Lifecycle V1

Lifecycle states:

- `PLANNED`;
- `ROUTED`;
- `RUNNING`;
- `SUSPENDED`;
- `RESUMED`;
- `STOPPED`;
- `CANCELLED`;
- `COMPLETED`;
- `FAILED`.

Master Controller owns lifecycle state. Runtime can report transitions, but it cannot persist canonical state by itself.

Allowed lifecycle pattern:

- plan locally;
- route through Model Router;
- validate budget through Cost Governor;
- execute only as local synthetic dry-run in this stage;
- emit evidence references;
- suspend/resume through serializable state;
- stop immediately when STOP is active.

Runtime may not decide release, deploy, merge, tag, production write, outbound send, payment, or owner approval outcomes.
