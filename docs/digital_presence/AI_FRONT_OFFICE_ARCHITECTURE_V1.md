# AI Front Office Architecture V1

AI Front Office output is an architecture handoff artifact only. It is not a production bot and does not send messages.

The draft workflow can include:

- inbound intake;
- intent label;
- draft response;
- owner approval;
- manual send handoff.

Disabled by contract:

- bot runtime;
- LLM provider calls;
- auto-send;
- outbound;
- production DB write;
- external browser actions.

Future activation requires owner approval and a separate stage.
