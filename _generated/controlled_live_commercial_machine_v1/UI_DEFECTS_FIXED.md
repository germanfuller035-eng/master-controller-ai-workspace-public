# UI defects fixed

- Replaced fake template-like site parsing with fact-only parsing and unknown-state copy.
- Added local mode path when server summary is unavailable.
- Added owner workflow screens after packet creation: approval, result, replies, CRM write, opportunity, invoice, payment, feedback, autonomy and safety.
- Added explicit QA owner override with reason.
- Added exact packet checks without hidden send.
- Added read-only reply monitor copy.
- Added CRM write and payment gates as separate approvals.
- Reworked visible safety copy from internal/raw terms to owner-readable Russian.
- Added static test coverage for commercial technical jargon in owner-visible literals.

Defects observed during Honor visual smoke and resolved before final install:

- Raw `Send/gate/Production` wording on Today fallback.
- Raw `STOP` wording on Today and command-center screens.
- Raw `Хэш текста`, `Хэш пакета` and `Ключ идемпотентности` wording on commercial screens.
- Long internal hash values on the owner approval screen.
- Owner-visible fake facts after fast site analysis.

Defects caused by the smoke tooling, not app code:

- ADB coordinate taps hit the keyboard when it was open; this inserted synthetic typo characters into the draft during smoke. QA correctly blocked that edited text until owner override was recorded.
