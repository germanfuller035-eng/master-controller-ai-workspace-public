# Digital Presence Check V1

The digital presence check is represented by a local JSON result with:

- `site_id`;
- synthetic fixture status;
- website quality score;
- lead capture readiness;
- evidence records;
- issue list;
- network/browser flags fixed to false.

No real website is opened, scraped, crawled, clicked, or submitted. A real URL in fixture input is rejected before analysis.

Every issue must carry an evidence id. Unsupported claims are not allowed to pass QA.
