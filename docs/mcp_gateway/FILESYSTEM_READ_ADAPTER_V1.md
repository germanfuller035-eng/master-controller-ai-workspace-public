# Filesystem Read Adapter V1

Adapter id: `filesystem_read`

Status: implemented for local synthetic use only.

Allowed action: `read_file`.

Controls:

- root comes from assigned worktree or repo root;
- absolute escape denied;
- `..` traversal denied;
- symlink escape denied by resolved path check;
- credential-like paths denied;
- binary files denied by default;
- max file size enforced;
- writes are not implemented.
