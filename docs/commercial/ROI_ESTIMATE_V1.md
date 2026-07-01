# ROI Estimate V1


Commercial Agent Factory V1 is draft/no-send only. It uses local synthetic fixtures, deterministic scoring, and saved evidence. It does not send email, social messages, forms, publications, invoices, payments, browser actions, real lead scraping, CRM writes, production DB writes, production deployment, Qdrant, Docling, crawler, or external MCP runtime.

Every factual claim requires evidence. Unsupported claims are blocked by QA / Red Team. Every future channel action requires owner approval before any send or publish step. COMMERCIAL_DRAFT remains OFF in production; OUTBOUND_EMAIL, OUTBOUND_SOCIAL, AUTO_SAFE, PRODUCTION_DB_WRITE, and PAYMENTS remain OFF.

ROI estimates are local deterministic calculations in SYNTHETIC_UNITS. An estimate cannot be created without explicit assumptions. The result is a draft planning artifact, not a promise, guarantee, invoice, or payment request.
