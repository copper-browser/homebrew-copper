# homebrew-copper

Homebrew tap for **[Copper](https://github.com/copper-browser/Copper)** — a small, fast, quiet
WebKit browser for macOS, with a built-in MCP server and `copper` CLI so agents (Claude Code,
phi) can drive it.

## Install

```sh
brew install --cask copper-browser/copper/copper
```

That taps `copper-browser/copper` and installs `/Applications/Copper.app` plus the `copper` CLI on
your `PATH`. Apple Silicon, macOS 14 Sonoma or later. Public — no token, no VPN.

Builds are ad-hoc signed (no Apple Developer ID, not notarized); the cask's `postflight` clears
the download quarantine flag so Gatekeeper lets it launch.

Already have a `/Applications/Copper.app` from a manual download or the curl installer? Homebrew
refuses to replace an app it did not install (`It seems there is already an App at …`). Quit
Copper and adopt it once with `brew install --cask --force copper-browser/copper/copper`. Your
data lives in `~/Library/Application Support/Copper` and `~/Library/WebKit/com.collinrijock.copper`,
not in the bundle.

## Upgrade

Normally you don't: Copper downloads and verifies the next release on its own and offers
**Update** in Settings › Updates (and ⌘K), which relaunches into it with the tab session intact.
The cask declares `auto_updates`, so a plain `brew upgrade` leaves it alone; by name it still
upgrades:

```sh
brew upgrade --cask copper
```

## Uninstall

```sh
brew uninstall --cask copper            # remove the app (keeps your data)
brew uninstall --zap --cask copper      # also delete session, WebKit site data, prefs, caches
```

## Without Homebrew

```sh
curl -fsSL https://github.com/copper-browser/Copper/releases/latest/download/copper-install.sh | sh
```

or download [`copper-macos-arm64.zip`](https://github.com/copper-browser/Copper/releases/latest/download/copper-macos-arm64.zip),
move `Copper.app` to `/Applications`, and run `xattr -cr /Applications/Copper.app` once.

## How the cask stays current

Releases are cut in the Copper repo, not here:
`gh workflow run release.yml -R copper-browser/Copper -f ref=fork` builds on a GitHub-hosted Mac
and publishes a `v<version>` GitHub release with the zip, its `.sha256`, `copper-version.json`
and the installer.

[`bump.yml`](.github/workflows/bump.yml) (hourly, or `gh workflow run bump.yml -R
copper-browser/homebrew-copper`) reads the newest release's `copper-version.json`, checks it
against the release's `.sha256` sidecar, re-renders `Casks/copper.rb` with
[`scripts/render-cask.mjs`](scripts/render-cask.mjs) and pushes it to `main`. No secrets — the
releases are public and the push uses the workflow's own `GITHUB_TOKEN`. The cask pins the
versioned asset (`releases/download/v<version>/copper-<version>-macos-arm64.zip`), never
`latest`, so its sha256 always matches.

| Path | What it is |
|---|---|
| `Casks/copper.rb` | The cask. **Generated** — do not hand-edit; the next bump overwrites it. |
| `scripts/render-cask.mjs` | Renders the cask from `--version --sha256 --commit [--cli]`. |
| `scripts/bump.mjs` | Fetches the latest `copper-version.json`, verifies, renders, writes. |
| `scripts/render-cask.test.mjs` | `node --test` coverage for both. |
| `.github/workflows/bump.yml` | Hourly/on-demand cask bump. |
| `.github/workflows/check.yml` | Tests + `brew readall` of the cask on macOS. |

## Troubleshooting

- **"Copper" can't be opened / is damaged** — the quarantine flag survived (the app was copied
  around manually). `xattr -cr /Applications/Copper.app`.
- **`It seems there is already an App at '/Applications/Copper.app'`** — quit Copper, then
  `brew install --cask --force copper-browser/copper/copper` once.
- **`SHA256 mismatch`** — the tap is stale. `brew update` and retry.
- **`brew upgrade --cask copper` says nothing to do but a newer release exists** — the hourly bump
  hasn't run yet; `gh workflow run bump.yml -R copper-browser/homebrew-copper`, or just let Copper
  update itself.
