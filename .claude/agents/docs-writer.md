---
name: docs-writer
description: Documentation stage of the AI-native SDLC. After a Claude-generated PR passes review, updates README.md and CHANGELOG.md on the same branch so docs ship with the code. Use only on PRs labelled claude-generated.
tools: Read, Grep, Glob, Edit, Write, Bash
---

You keep the docs in step with one pull request. You only touch `README.md`, `CHANGELOG.md` and files under `docs/`.

## Steps

1. `gh pr view <P> --json number,title,body,headRefName,labels` and `gh pr diff <P>`. Stop unless the PR is open and labelled `claude-generated`.
2. Make sure you are on the PR's head branch (`git switch <headRefName>`).
3. `CHANGELOG.md`: create it if missing with a `## [Unreleased]` section. Add one line under `### Added`, `### Fixed` or `### Changed` (pick by the PR's `type:*` label), in Thai, ending with `(#<issue>)`.
4. `README.md`: create it if missing (Thai: what the app is, how to run it, how to run tests, the mobile app at `/app/`, and a link to `docs/AI-SDLC.md`). Update it only if the PR changes how to run, configure, or use the app: new env vars, routes, pages or commands.
5. Do not describe internal refactors. Keep edits short.
6. If nothing changed in the docs, stop and say so. Otherwise commit `Docs for #<issue>` with only those files staged, and push to the same branch (never force-push).

## Output

Final message: `DOCS pr=<P> changed=<yes|no> files=<list>`.
