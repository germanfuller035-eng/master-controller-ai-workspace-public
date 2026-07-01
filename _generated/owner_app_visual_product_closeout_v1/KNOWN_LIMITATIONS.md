# Known Limitations

- Live email/social/Telegram/SMS sending remains OFF by design. The app prepares owner-controlled manual send packets only.
- Payments remain OFF until a separate payment gate.
- Production database writes remain OFF until a separate write gate.
- If backend refresh is unavailable, the app shows stale local data with a visible refresh action and reason; it does not treat stale data as a normal green state.
- Some internal automation IDs still keep historical `pilot_` prefixes for test compatibility. They are not owner-visible UI text.
- Deeper non-primary screens outside the required visual closeout set may still need later product-language polish.
