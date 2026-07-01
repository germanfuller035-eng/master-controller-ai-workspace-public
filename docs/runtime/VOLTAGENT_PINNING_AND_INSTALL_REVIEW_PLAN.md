# VoltAgent Pinning And Install Review Plan

STATUS=PLAN_ONLY_NO_INSTALL

This session does not install VoltAgent, does not run package-manager installation, and does not download from GitHub.

Future install requirements:

- owner approval before any project-local install;
- exact package/source selected and recorded;
- exact version pinned;
- license reviewed;
- quarantine download directory used;
- dependency tree scanned;
- secret scan performed;
- shell and network capability scan performed;
- prompt-injection surface reviewed;
- project-local only installation;
- synthetic acceptance before runtime activation;
- production disabled until a later explicit gate.

Production remains disabled until a later owner-approved stage. No package manager files are changed in this session.
