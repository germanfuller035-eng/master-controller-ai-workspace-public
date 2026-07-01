# Known Limitations

- Today can show stale/offline data when the server is unavailable; the owner sees the stale state, last-refresh context and local fallback action.
- The current workflow prepares and records local owner actions. Live email/social sending, live payment links and production writes remain gated OFF.
- Device smoke used synthetic local input only. Real lead/contact validation remains private and must not be committed to Git.
- Some long workflow screens require vertical scrolling on Honor before tapping lower actions; this was included in the smoke traversal.
