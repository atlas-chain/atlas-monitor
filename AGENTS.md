# Agent Instructions

## Fast Iteration Workflow

When making changes in this repository, finish by creating a clear version
commit and pushing it to the remote branch unless the user explicitly asks not
to. Keep commits small, descriptive, and ready for quick review.

For multiline commit messages, write the message to a temporary file and commit
with `git commit -F <file>`, then remove the file and verify the final message
with `git log -1 --format=%B` before considering the push done.

