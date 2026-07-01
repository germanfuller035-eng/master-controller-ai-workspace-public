# Known Limitations

Intentional gates that remain closed:
- Auto-send is off.
- Live email/social sending is off.
- Production CRM/database write is off.
- Live payments and payment links are off.
- VPS, DNS, HAPP and proxy release changes were not touched.

Operational notes:
- Manual send still requires the owner to review the packet and perform the real send outside the app or through a separately approved live-send gate.
- Payment collection is intentionally draft-only until real client feedback exists and the payment gate is approved.
- Production sync of manual results requires a separate production-write gate.
- Private screenshots and any real client data belong in file vault/private evidence, not Git.
