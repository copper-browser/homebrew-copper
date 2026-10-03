# Rendered by scripts/render-cask.mjs in copper-browser/homebrew-copper — do not hand-edit
# Built from copper-browser/Copper@1a5e35bb693323f53e036ed96d3f21b640d959e1 (release v1.0.20261002.17).

cask "copper" do
  version "1.0.20261002.17"
  sha256 "1791d67a5abd08c78a62ea36cb2c98f7296ea12cadbc020d26c745dd71cf422c"

  url "https://github.com/copper-browser/Copper/releases/download/v#{version}/copper-#{version}-macos-arm64.zip"
  name "Copper"
  desc "Small, fast WebKit browser with a built-in MCP server for agents"
  homepage "https://github.com/copper-browser/Copper"

  # Why auto_updates: Copper updates itself from the same GitHub releases (it
  # downloads and verifies the release in the background, then Settings ›
  # Updates swaps the bundle in and relaunches), so a plain `brew upgrade`
  # must not replace the bundle under a running Copper. Naming the cask still
  # upgrades it — `brew upgrade --cask copper` and `brew reinstall --cask
  # copper` remain the manual paths.
  auto_updates true

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :sonoma
  depends_on arch: :arm64

  app "Copper.app"

  # Why binary: expose the bundled `copper` CLI shim on PATH at install time.
  # It is rendered only when the built bundle actually ships the shim.
  binary "#{appdir}/Copper.app/Contents/Resources/bin/copper"

  # Why: the bundle is ad-hoc signed (no Apple Developer ID, no notarization),
  # so Gatekeeper refuses to launch it until the download quarantine flag is
  # cleared. `postflight_steps` (Homebrew ≥ 7.0.6) rather than the
  # deprecated `postflight` block; `brew install` updates Homebrew first.
  postflight_steps do
    run "/usr/bin/xattr", args: ["-cr", "{{appdir}}/Copper.app"]
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
