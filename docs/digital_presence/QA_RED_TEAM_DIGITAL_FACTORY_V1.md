# QA Red Team Digital Factory V1

QA / Red Team is mandatory for every digital factory run.

It blocks:

- unsupported claims;
- claims without evidence;
- claims referencing missing evidence;
- deploy or publish recommendations without owner approval;
- form submit;
- outbound email or social send;
- production DB write;
- unsafe website or front-office recommendations.

The review is deterministic and local. It does not call LLMs or external services.
