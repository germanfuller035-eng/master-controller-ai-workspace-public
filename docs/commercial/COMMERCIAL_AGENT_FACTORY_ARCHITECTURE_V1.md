# Commercial Agent Factory Architecture V1


Commercial Agent Factory V1 is draft/no-send only. It uses local synthetic fixtures, deterministic scoring, and saved evidence. It does not send email, social messages, forms, publications, invoices, payments, browser actions, real lead scraping, CRM writes, production DB writes, production deployment, Qdrant, Docling, crawler, or external MCP runtime.

Every factual claim requires evidence. Unsupported claims are blocked by QA / Red Team. Every future channel action requires owner approval before any send or publish step. COMMERCIAL_DRAFT remains OFF in production; OUTBOUND_EMAIL, OUTBOUND_SOCIAL, AUTO_SAFE, PRODUCTION_DB_WRITE, and PAYMENTS remain OFF.

## Pipeline

1. A lead enters only as an explicit synthetic local fixture with external access disabled.
2. Identity and contact data are represented as synthetic organization, domain reference, contact-form reference, public contact page reference, role contact reference, and consent basis. Real emails, phones, people, or client data are not allowed in fixtures.
3. Qualification uses deterministic fixture signals and contact completeness. Unsupported assumptions are not allowed.
4. Digital presence analysis reads synthetic site fixtures only. No browser, crawler, scraping, or network action is used.
5. Product Strategy chooses the first product by the dominant actual problem signal: Website, Lead System, AI Front Office, or Mini Audit.
6. Mini Audit is generated with evidence and is not the automatic first product when another product fits better.
7. ROI estimates require explicit assumptions and use synthetic units.
8. Offers are draft objects only with no channel actions.
9. QA / Red Team blocks unsupported claims, missing evidence, send attempts, and ROI without assumptions.
10. Duplicate detection blocks deterministic organization/domain fingerprints.
11. Contact completeness is scored against a 95 target.
12. Capacity-aware flow throttles expensive material generation when limits are reached.
13. Owner approval is required before any future channel action.
14. Real crawling, outbound, CRM, payments, production writes, and integrations remain not implemented.
