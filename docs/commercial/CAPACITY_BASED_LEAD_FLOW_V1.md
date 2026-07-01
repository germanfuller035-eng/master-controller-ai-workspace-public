# Capacity Based Lead Flow V1


Commercial Agent Factory V1 is draft/no-send only. It uses local synthetic fixtures, deterministic scoring, and saved evidence. It does not send email, social messages, forms, publications, invoices, payments, browser actions, real lead scraping, CRM writes, production DB writes, production deployment, Qdrant, Docling, crawler, or external MCP runtime.

Every factual claim requires evidence. Unsupported claims are blocked by QA / Red Team. Every future channel action requires owner approval before any send or publish step. COMMERCIAL_DRAFT remains OFF in production; OUTBOUND_EMAIL, OUTBOUND_SOCIAL, AUTO_SAFE, PRODUCTION_DB_WRITE, and PAYMENTS remain OFF.

Capacity policy tracks expensive material generation. If a synthetic batch exceeds the local limit, expensive drafts are throttled and the lead stays unsent. Daily send cap is documented but not active because sending is not implemented in this stage.
