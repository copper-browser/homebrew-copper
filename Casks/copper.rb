# Rendered by scripts/render-cask.mjs in copper-browser/homebrew-copper — do not hand-edit
# Built from copper-browser/Copper@7904d9152aad03c2edcef60dcd1dcb4e8b80fa2d (release v1.0.20261124.117).

cask "copper" do
  arch arm: "arm64", intel: "x86_64"

  version "1.0.20261124.117"
  sha256 arm:   "1f61af1db311d78dc9deee2cb509310777cb016a9c647d48b7c9cb87b71eaec9",
         intel: "5299990e23afe47e77ad6741b29f487634d90ccb9c0ebef7f02eae3b244c8d96"

  url "https://github.com/copper-browser/Copper/releases/download/v#{version}/copper-#{version}-macos-#{arch}.zip"
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
