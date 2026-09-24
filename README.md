# homebrew-copper

Private Homebrew tap for **Copper** — Exowatt's fork of the Copper WebKit
browser for macOS ([collinrijock/Copper](https://github.com/collinrijock/Copper),
branch `fork`). Copper ships a built-in MCP server that agents (phi, Claude Code)
drive; this tap is how the team installs and upgrades it.

Homebrew is the macOS install **and update** path. Builds are ad-hoc signed
(no Apple Developer ID, not notarized), so the app cannot update itself in
place; `brew upgrade --cask copper` does it instead. The cask's `postflight`
clears the download quarantine flag so Gatekeeper lets an ad-hoc build launch.

**Internal network only.** The archives live on `forca.apps.exowatt.com`, the
same internal release feed that serves FORCA and phi. It resolves only on the
Exowatt network/VPN and is deliberately not behind SSO, so a plain Homebrew
`url` works — no GitHub token, no `HOMEBREW_GITHUB_API_TOKEN`, no vendored
download strategy (unlike `homebrew-forca`).

## Install

Apple Silicon only for now (`depends_on arch: :arm64`), macOS 14 Sonoma or newer.

```sh
brew tap exowatt-labs/copper            # private repo: needs `gh auth login` / git HTTPS creds once
brew install --cask exowatt-labs/copper/copper
```

Already have `/Applications/Copper.app` from a manual build or the curl
installer? Homebrew refuses to replace an app it did not install
(`It seems there is already an App at '/Applications/Copper.app'`). Quit
Copper and adopt it once with `brew install --cask --force exowatt-labs/copper/copper`.
Your data lives in `~/Library/Application Support/Copper` and
`~/Library/WebKit/com.collinrijock.copper`, not in the bundle. Back up
`~/Library/Application Support/Copper/session.json` first if you care about the
open-tab session (the curl installer does this for you automatically).

## Upgrade

```sh
brew upgrade --cask copper
```

Quit Copper first; Homebrew replaces the bundle in place and the tab session is
restored from `session.json` on relaunch.

## Uninstall

```sh
brew uninstall --cask copper            # remove the app (keeps your data)
brew uninstall --zap --cask copper      # also delete session, WebKit site data, prefs, caches
```

## The curl alternative

No Homebrew, or a machine you just want the app on:

```sh
curl -fsSL https://forca.apps.exowatt.com/downloads/copper-install.sh | sh
```

`scripts/copper-install.sh` downloads `copper-latest-macos-arm64.zip` from the
feed, verifies its SHA-256 against the published sidecar, backs up
`session.json`, quits a running Copper (only if it is the one being replaced),
installs to `/Applications` (`COPPER_INSTALL_DIR` to override), clears
quarantine, links the `copper` CLI shim into the first writable of
`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin` (`COPPER_BIN_DIR` to
override) when the build ships one, and relaunches (`--no-launch` /
`COPPER_NO_LAUNCH=1` to skip). `--cli-only` just re-links the shim. Re-running
it upgrades in place. It is the same bytes the cask installs.

## How a release is cut

Releases are on-demand, from this repo:

```sh
gh workflow run release.yml -R Exowatt-Labs/homebrew-copper -f ref=fork
gh run watch -R Exowatt-Labs/homebrew-copper
```

`.github/workflows/release.yml`:

1. **build** (`macos-15`, GitHub-hosted): checks out `collinrijock/Copper@<ref>`
   (public), runs `./build.sh release app`, stamps the release version into
   `CFBundleShortVersionString`, re-signs ad hoc, zips with `ditto --keepParent`
   (`scripts/package-app.sh`), and hands the artifact over.
2. **publish** (`[self-hosted, app-deploy]`, in-lab — the feed is internal-only
   DNS): uploads to the feed as product `copper` via the chunked upload protocol
   (`scripts/upload-to-forca-feed.mjs`, ported verbatim from `Exowatt-Labs/phi`),
   verifies the archived bytes, renders `Casks/copper.rb`
   (`scripts/render-cask.mjs`) and pushes it to `main` as `copper-release[bot]`
   using the workflow's own `GITHUB_TOKEN` (`permissions: contents: write` — no
   deploy key, because the workflow lives in the tap).

Inputs: `ref` (default `fork`; any branch/tag/SHA of collinrijock/Copper) and
`status` (default `lkg`). `lkg` publishes the flat `/downloads/` aliases and
bumps the cask in one go — every run here is a human dispatch, so the dispatch
is the approval (phi needs a separate candidate → LKG promotion because it
auto-publishes every main push; Copper does not). `status=candidate` archives
the build under its immutable URL for testing and touches neither the aliases
nor the cask.

### Version scheme

`<VERSION file>.<YYYYMMDD>.<github.run_number>` — e.g. `1.0.20260924.3`. The
`VERSION` file in Copper is `1.0`; the date and run number make every release
unique and monotonic for Homebrew's version comparison even when `fork` is
rebased onto upstream. The same string is stamped into the app, so the About
box and the MCP `serverInfo.version` match `brew info --cask copper`. The built
commit is recorded in the cask header, in `copper-version.json`, and in the
feed's release metadata (`commit`).

### Where artifacts live

| URL | What |
|---|---|
| `https://forca.apps.exowatt.com/releases/copper/<release_id>/downloads/copper-<version>-macos-arm64.zip` | Immutable archive — **what the cask points at**. `release_id` = `<version>-g<commit12>`. Never overwritten, so an older cask revision stays installable and the sha256 always matches. |
| `https://forca.apps.exowatt.com/downloads/copper-latest-macos-arm64.zip` | Flat "latest" alias, rewritten by every `lkg` release — what the curl installer fetches. |
| `…/downloads/copper-latest-macos-arm64.zip.sha256` | shasum-format digest of the alias, for the installer. |
| `…/downloads/copper-install.sh` | The curl installer (published from `scripts/copper-install.sh` on every `lkg` release). |
| `…/downloads/copper-version.json` | `{version, releaseId, commit, sha256, hasCli, archiveUrl, …}` for the latest release. |
| `https://forca.apps.exowatt.com/api/releases/catalog` | Full catalog JSON (`releases.copper.*`, `current.copper`). |
| `https://forca.apps.exowatt.com/` | Download page with the Copper card. |

The feed keeps the newest 10 releases per product for at least 15 days
(`Exowatt-Labs/forca-updates` retention policy).

## Contents

| Path | What it is |
|---|---|
| `Casks/copper.rb` | The cask. **Generated** by `release.yml` — do not hand-edit; the next release overwrites it. |
| `scripts/render-cask.mjs` | Renders the cask from `--version --sha256 --release-id --commit [--cli]`. `binary` stanza only when the built bundle has `Contents/Resources/bin/copper`. |
| `scripts/render-cask.test.mjs` | `node --test` coverage for the renderer. |
| `scripts/package-app.sh` | Stamp version → ad-hoc re-sign → `ditto` zip + `.sha256`; prints `has_cli=`. |
| `scripts/upload-to-forca-feed.mjs` | Chunked upload / finalize client for the feed (needs `FORCA_FEED_UPLOAD_TOKEN`). |
| `scripts/copper-install.sh` | The curl installer. |
| `.github/workflows/release.yml` | Build + publish + cask bump (`workflow_dispatch`). |
| `.github/workflows/check.yml` | Renderer tests, shellcheck, `brew readall` of the cask on macOS. Bot pushes don't trigger it — `gh workflow run check.yml` after a release if you want the DSL re-evaluated. |

Secrets/infra: `FORCA_FEED_UPLOAD_TOKEN` (repo Actions secret; same value as
the feed app's `UPLOAD_TOKEN` and the secret of the same name on
`Exowatt-Labs/phi` and `Exowatt-Labs/forca`). The publish job needs the
org-level `app-deploy` self-hosted runner pool, which serves every
`Exowatt-Labs` repo.

## Troubleshooting

- **`Could not resolve host: forca.apps.exowatt.com`** (brew fetch or the curl
  installer) — you are off the Exowatt network. Connect to the VPN and retry.
- **`brew tap` asks for a username/password** — the tap repo is private. Run
  `gh auth login` (or `gh auth setup-git`) so git can use your GitHub
  credentials over HTTPS, then retry.
- **"Copper" can't be opened / is damaged** — the quarantine flag survived
  (e.g. the app was copied around manually). `xattr -cr /Applications/Copper.app`,
  which is exactly what the cask's `postflight` and the installer do.
- **`It seems there is already an App at '/Applications/Copper.app'`** — a
  non-Homebrew install predates the cask. Quit Copper, then
  `brew install --cask --force exowatt-labs/copper/copper` once.
- **`SHA256 mismatch`** — a release is mid-publish or the tap is stale.
  `brew update` (or `git -C "$(brew --repository exowatt-labs/copper)" pull`) and retry; the
  cask always points at an immutable archive, so a stale-but-complete tap
  never mismatches.
- **My tab session disappeared after an upgrade** — copy the newest
  `~/Library/Application Support/Copper/session.backup-*.json` (written by the
  curl installer) back over `session.json` while Copper is quit.
- **`brew upgrade --cask copper` says nothing to do but the feed has a newer
  build** — the release ran as `status=candidate`, or the cask push failed;
  check the run's summary on the Actions tab.
