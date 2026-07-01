# Git Read Adapter V1

Adapter id: `git_read`

Status: implemented for local synthetic use only.

Allowed actions:

- `status`
- `log`
- `show`
- `diff`
- `branch_show_current`
- `rev_parse`

Denied actions:

- commit
- merge
- push
- checkout
- reset
- clean
- tag
- rebase

The adapter uses subprocess argument arrays and rejects shell metacharacters in user-controlled arguments.
