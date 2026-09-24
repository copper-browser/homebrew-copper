# Rendered by scripts/render-cask.mjs in Exowatt-Labs/homebrew-copper — do not hand-edit
# Built from collinrijock/Copper@ac59530a0cc310dec3ba12db77f9e38c3d6f5add (branch fork).
# Why a plain `url`: the archive lives on forca.apps.exowatt.com, which is
# internal-network-only DNS and deliberately not behind SSO, so Homebrew's
# stock curl fetch works — no vendored download strategy, no GitHub token.

cask "copper" do
  version "1.0.20260924.2"
  sha256 "35cdd582a42b1c9c28ec7e328bbf7035387a8b0bfde3045c7c284994d235f26b"

  url "https://forca.apps.exowatt.com/releases/copper/#{version}-gac59530a0cc3/downloads/copper-#{version}-macos-arm64.zip"
  name "Copper"
  desc "Exowatt's fork of Copper, a native WebKit browser for macOS with a built-in MCP server"
  homepage "https://github.com/collinrijock/Copper"

  # Why: no `auto_updates` on purpose — Homebrew IS the macOS update path for
  # Copper. Builds are ad-hoc signed, not notarized, so the app's own updater
  # cannot swap the bundle in place; declaring auto_updates would make
  # `brew upgrade --cask copper` a no-op unless the user passed --greedy.
  # No `livecheck` either: the feed is internal-only and the release workflow
  # rewrites this file on every release, so there is nothing for brew to poll.
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
