# Rendered by scripts/render-cask.mjs in Exowatt-Labs/homebrew-copper — do not hand-edit
# Built from collinrijock/Copper@3a1661738d8e0cf3026a7b8d58fde6721fb3a78c (branch fork).
# Why a plain `url`: the archive lives on forca.apps.exowatt.com, which is
# internal-network-only DNS and deliberately not behind SSO, so Homebrew's
# stock curl fetch works — no vendored download strategy, no GitHub token.

cask "copper" do
  version "1.0.20260930.37"
  sha256 "7ee636e6babe1121d9de617b9ecb47224426cab9aec33aaea8288049033ab74c"

  url "https://forca.apps.exowatt.com/releases/copper/#{version}-g3a1661738d8e/downloads/copper-#{version}-macos-arm64.zip"
  name "Copper"
  desc "Exowatt's fork of Copper, a native WebKit browser for macOS with a built-in MCP server"
  homepage "https://github.com/collinrijock/Copper"

  # Why auto_updates: Copper updates itself from the same feed (it downloads
  # and verifies the release in the background, then Settings › Updates swaps
  # the bundle in and relaunches), so a plain `brew upgrade` must not
  # replace the bundle under a running Copper with bytes it already has.
  # Naming the cask still upgrades it — Homebrew treats named casks as
  # greedy — so `brew upgrade --cask copper` and `brew reinstall --cask
  # copper` remain the manual paths.
  auto_updates true

  # No livecheck polling either: the feed is internal-only and the release
  # workflow rewrites this file on every release, so there is nothing for brew
  # to poll. The explicit skip stops `brew audit --strict` from guessing a
  # GitHub-tag livecheck off the homepage (which would report Copper's static
  # VERSION file, 1.0, as "latest").
  livecheck do
    skip "versions come from the internal release workflow, not the upstream repo"
  end

  depends_on macos: :sonoma
  depends_on arch: :arm64

  app "Copper.app"

  # Why binary: expose the bundled `copper` CLI shim on PATH at install time.
  # It is rendered only when the built bundle actually ships the shim.
  binary "#{appdir}/Copper.app/Contents/Resources/bin/copper"

  # Why: the bundle is ad-hoc signed (no Apple Developer ID, no notarization),
  # so Gatekeeper refuses to launch it until the download quarantine flag is
  # cleared — same reasoning as the forca and emu casks. Homebrew ≥ 7.0.6 warns
  # that `postflight` is deprecated in favour of `postflight_steps`; kept as
  # `postflight` deliberately so the cask evaluates on the older Homebrew the
  # team's Macs still run (forca and emu do the same). Flip it in the renderer.
  postflight do
    system_command "/usr/bin/xattr", args: ["-cr", "#{appdir}/Copper.app"]
  end

  # Why: Copper keeps its tab session and settings under its own Application
  # Support dir; WebKit keeps site data under the bundle id. Nothing here is
  # removed by a plain uninstall — only by `brew uninstall --zap`.
  zap trash: [
    "~/Library/Application Support/Copper",
    "~/Library/Caches/com.collinrijock.copper",
    "~/Library/HTTPStorages/com.collinrijock.copper",
    "~/Library/Preferences/com.collinrijock.copper.plist",
    "~/Library/Saved Application State/com.collinrijock.copper.savedState",
    "~/Library/WebKit/com.collinrijock.copper",
  ]
end
