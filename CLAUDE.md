## CI/CD

This repo runs its script checks and the hourly cask bump on **Roadrunner** (Exowatt's Woodpecker + Dagger CI, `.woodpecker/`); the macOS cask checks (`.github/workflows/check.yml`) stay on GitHub Actions for now. Check builds with `gh rr status`, `gh rr watch`, `gh rr logs`, `gh rr rerun` (install: `gh extension install Exowatt-Labs/gh-roadrunner && gh alias set rr roadrunner --clobber`) — `gh run` only sees GitHub Actions. Console: https://cicd.apps.exowatt.com.
