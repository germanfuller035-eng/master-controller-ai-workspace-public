# Mini Audit Agent V1


Commercial Agent Factory V1 is draft/no-send only. It uses local synthetic fixtures, deterministic scoring, and saved evidence. It does not send email, social messages, forms, publications, invoices, payments, browser actions, real lead scraping, CRM writes, production DB writes, production deployment, Qdrant, Docling, crawler, or external MCP runtime.

Every factual claim requires evidence. Unsupported claims are blocked by QA / Red Team. Every future channel action requires owner approval before any send or publish step. COMMERCIAL_DRAFT remains OFF in production; OUTBOUND_EMAIL, OUTBOUND_SOCIAL, AUTO_SAFE, PRODUCTION_DB_WRITE, and PAYMENTS remain OFF.

Mini Audit produces evidence-backed draft findings from synthetic digital presence fixtures. It is not the default first product. Product Strategy may choose Website, Lead System, or AI Front Office first when those problems dominate. Every audit claim includes evidence ids and is rejected if evidence is missing.
