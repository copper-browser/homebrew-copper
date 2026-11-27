# homebrew-copper

Homebrew tap for **[Copper](https://github.com/copper-browser/Copper)** — a small, fast, quiet
WebKit browser for macOS, with a built-in MCP server and `copper` CLI so agents (Claude Code,
phi) can drive it.

## Install

```sh
brew install --cask copper-browser/copper/copper
```

That taps `copper-browser/copper` and installs `/Applications/Copper.app` plus the `copper` CLI on
your `PATH`. Apple Silicon or Intel (each gets its own build), macOS 14 Sonoma or later. Public — no token, no VPN.

Builds are signed with Copper's Developer ID and notarized by Apple, so Gatekeeper opens them as
they are; the cask needs no postflight.

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

or download [`copper-macos-arm64.zip`](https://github.com/copper-browser/Copper/releases/latest/download/copper-macos-arm64.zip)
(Apple Silicon) or [`copper-macos-x86_64.zip`](https://github.com/copper-browser/Copper/releases/latest/download/copper-macos-x86_64.zip) (Intel),
and move `Copper.app` to `/Applications`.

## How the cask stays current

Releases are cut in the Copper repo, not here: its Roadrunner pipeline
(`.woodpecker/release.yaml` in copper-browser/Copper, docs/releasing.md there) builds, signs,
notarizes and publishes a `v<version>` GitHub release with the zips, disk images, their
`.sha256`, `copper-version.json` and the installer, and then bumps this tap itself:
`release/bump-tap.sh` there runs this repo's [`scripts/bump.mjs`](scripts/bump.mjs) on that
release's `copper-version.json` (checked against each zip's `.sha256` sidecar), and commits the
re-rendered `Casks/copper.rb` to `main` through GitHub's contents API as `exowatt-woodpecker-bot`.
It never moves the cask to an older version. By hand: `release/bump-tap.sh [<version>]` in a
Copper checkout, or a manual Roadrunner run of [`.woodpecker/bump.yaml`](.woodpecker/bump.yaml)
here (`ci/bump.sh`, the latest release). The cask pins the
versioned asset (`releases/download/v<version>/copper-<version>-macos-<arch>.zip`, `arm64` or
`x86_64` through the cask's `arch` stanza), never
`latest`, so its sha256 always matches.

| Path | What it is |
|---|---|
| `Casks/copper.rb` | The cask. **Generated** — do not hand-edit; the next bump overwrites it. |
| `scripts/render-cask.mjs` | Renders the cask from `--version --sha256 --commit [--cli]`. |
| `scripts/bump.mjs` | Fetches the latest `copper-version.json`, verifies, renders, writes. |
| `scripts/render-cask.test.mjs` | `node --test` coverage for both. |
| `.woodpecker/bump.yaml` | On-demand cask bump on Roadrunner (manual run; the release pipeline bumps by itself). |
| `.github/workflows/check.yml` | Tests + `brew readall` of the cask on macOS. |

## Troubleshooting

- **"Copper" can't be opened / is damaged** — a build from before notarization (1.0.20261124.117 and
  older) with its quarantine flag on. `xattr -cr /Applications/Copper.app`, or update.
- **`It seems there is already an App at '/Applications/Copper.app'`** — quit Copper, then
  `brew install --cask --force copper-browser/copper/copper` once.
- **`SHA256 mismatch`** — the tap is stale. `brew update` and retry.
- **`brew upgrade --cask copper` says nothing to do but a newer release exists** — the release's
  tap step didn't run or failed; `release/bump-tap.sh` in a Copper checkout (or a manual run of
  `.woodpecker/bump.yaml`), or just let Copper update itself.
