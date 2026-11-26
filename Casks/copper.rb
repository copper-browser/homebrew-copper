# Rendered by scripts/render-cask.mjs in copper-browser/homebrew-copper — do not hand-edit
# Built from copper-browser/Copper@72dff3d228a243661fe32faa6345386b4618334c (release v1.0.20261126.125).

cask "copper" do
  arch arm: "arm64", intel: "x86_64"

  version "1.0.20261126.125"
  sha256 arm:   "b51a788efb7ed2f469e294ad1c567ab9f8fe4af2d90491c1df24872970e27a9f",
         intel: "b4ab4592a588d852fb2cadf92d44dc192d5608b131c74b32fc35aaaca339ac90"

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

  # Nothing clears the quarantine flag: releases are signed with Copper's
  # Developer ID and notarized, so Gatekeeper opens the app as downloaded.

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
