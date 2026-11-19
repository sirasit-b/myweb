# Tech Department Manager

A zero-dependency web app for managing a Tech department (tasks / members / projects), with a **mobile app for reporting problems** that sends reports to GitHub so the AI team can pick them up and work on them automatically.

## Run

```bash
npm start            # http://localhost:3000
npm test             # all tests (Node 22+)
```

| Page | URL |
|---|---|
| Main web app | `/` |
| Landing | `/simple.html` |
| Mobile problem-reporting app (PWA) | `/app/` |

## Mobile app → GitHub issue

Set these variables when starting the server (the token stays on the server only and is never sent to the phone):

```bash
GITHUB_TOKEN=<fine-grained token: Issues read/write for this repo only> GITHUB_REPO=sirasit-b/myweb npm start
```

- Open `/app/` on your phone and choose *Add to Home Screen* to install it as an app (it must be served over HTTPS to be installable and work offline).
- The "Report" tab ("แจ้งเรื่อง") creates an issue with the label `source:mobile-app`.
- The "My issues" tab ("เรื่องของฉัน") shows the real status from GitHub: received → triaged → planned → in development → in review → released

| Variable | Meaning |
|---|---|
| `PORT` | Port (default 3000) |
| `DATA_FILE` | Data file (default `data/db.json`) |
| `GITHUB_TOKEN` | Token used to create issues |
| `GITHUB_REPO` | `owner/repo` where issues are opened |
| `GITHUB_API` | Used in tests to point at a fake GitHub |

## AI-native SDLC

Every issue goes through automated agents: triage → plan → implement (TDD) → code / security / QA review → documentation → merge → release.
Details and setup are in [docs/AI-SDLC.md](docs/AI-SDLC.md).
