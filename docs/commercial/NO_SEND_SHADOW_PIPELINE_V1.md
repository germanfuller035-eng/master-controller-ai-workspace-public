# No-Send Shadow Pipeline V1


Commercial Agent Factory V1 is draft/no-send only. It uses local synthetic fixtures, deterministic scoring, and saved evidence. It does not send email, social messages, forms, publications, invoices, payments, browser actions, real lead scraping, CRM writes, production DB writes, production deployment, Qdrant, Docling, crawler, or external MCP runtime.

Every factual claim requires evidence. Unsupported claims are blocked by QA / Red Team. Every future channel action requires owner approval before any send or publish step. COMMERCIAL_DRAFT remains OFF in production; OUTBOUND_EMAIL, OUTBOUND_SOCIAL, AUTO_SAFE, PRODUCTION_DB_WRITE, and PAYMENTS remain OFF.

The no-send shadow pipeline runs discovery fixture -> identity verification -> contact completeness -> qualification -> digital presence analysis -> product strategy -> mini audit or alternative first product -> ROI estimate -> offer draft -> QA / Red Team -> no-send shadow result. The final step enforces no outbound, no payment, no production write, and owner approval before any future send.
