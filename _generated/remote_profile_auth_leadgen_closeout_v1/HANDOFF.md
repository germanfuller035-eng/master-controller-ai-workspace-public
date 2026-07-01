# Handoff

Current state:
- Android remote server profile is owner-readable and recoverable.
- API authorization flow works against VPS.
- Server lead discovery can be started from the app.
- Draft save works through VPS.
- Samsung has the latest tested APK installed.

Next safe gate:
- Run one SMTP canary only after explicit approval for one exact recipient, subject, and body.

Do not do without a separate gate:
- Mass-send.
- Payment live actions.
- Production database write.
- DNS/VPS release changes unrelated to this workflow.
