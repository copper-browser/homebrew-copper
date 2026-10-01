#!/usr/bin/env node

// Renders Casks/copper.rb for the Homebrew tap copper-browser/homebrew-copper.
// .github/workflows/bump.yml runs scripts/bump.mjs, which reads the newest
// copper-browser/Copper release's copper-version.json and calls this; the cask
// is generated, never hand-edited.
//
//   node scripts/render-cask.mjs --version X --sha256 HEX --commit SHA [--cli|--no-cli]

import { pathToFileURL } from 'node:url'

// <VERSION file>.<YYYYMMDD>.<github.run_number>, e.g. 1.0.20261001.1 — monotonic
// for Homebrew's version comparison even when `fork` is rebased.
const VERSION_PATTERN = /^\d+\.\d+\.\d{8}\.\d+$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

export const SOURCE_REPO = 'copper-browser/Copper'
export const RELEASES_URL = `https://github.com/${SOURCE_REPO}/releases`

function assertMatch(label, value, pattern, hint) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`invalid ${label}: ${String(value)} (${hint})`)
  }
}

export function zipName(version) {
  return `copper-${version}-macos-arm64.zip`
}

/** The immutable, versioned release asset the cask pins (and its sha256 covers). */
export function archiveUrl({ version }) {
  return `${RELEASES_URL}/download/v${version}/${zipName(version)}`
}

/**
 * @param {{ version: string, sha256: string, commit: string, cli: boolean }} input
 * @returns {string} the complete Casks/copper.rb text, newline-terminated
 */
export function renderCopperCask({ version, sha256, commit, cli }) {
  assertMatch('version', version, VERSION_PATTERN, 'expected MAJOR.MINOR.YYYYMMDD.RUN, e.g. 1.0.20261001.1')
  assertMatch('sha256', sha256, SHA256_PATTERN, 'expected 64 lowercase hex characters')
  assertMatch('commit', commit, COMMIT_PATTERN, 'expected a full 40-character lowercase SHA')
  if (typeof cli !== 'boolean') throw new Error('cli must be a boolean')

  // Why the versioned asset and not releases/latest/download/copper-macos-arm64.zip:
  // "latest" moves with the next release, which would break this cask's sha256
  // for anyone installing between a release and the matching tap bump, and
  // would make an older cask revision uninstallable. The tag's asset never
  // changes. `#{version}` is interpolated by Homebrew so `brew audit` sees a
  // versioned URL.
  const url = `${RELEASES_URL}/download/v#{version}/copper-#{version}-macos-arm64.zip`

  const binaryStanza = cli
    ? `
  # Why binary: expose the bundled \`copper\` CLI shim on PATH at install time.
  # It is rendered only when the built bundle actually ships the shim.
  binary "#{appdir}/Copper.app/Contents/Resources/bin/copper"
`
    : `
  # No \`binary\` stanza: the build at ${commit.slice(0, 12)} does not ship
  # Contents/Resources/bin/copper. It is rendered automatically once it does.
`

  return `# Rendered by scripts/render-cask.mjs in copper-browser/homebrew-copper — do not hand-edit
# Built from ${SOURCE_REPO}@${commit} (release v${version}).

cask "copper" do
  version "${version}"
  sha256 "${sha256}"

  url "${url}"
  name "Copper"
  desc "Small, fast WebKit browser with a built-in MCP server for agents"
  homepage "https://github.com/${SOURCE_REPO}"

  # Why auto_updates: Copper updates itself from the same GitHub releases (it
  # downloads and verifies the release in the background, then Settings ›
  # Updates swaps the bundle in and relaunches), so a plain \`brew upgrade\`
  # must not replace the bundle under a running Copper. Naming the cask still
  # upgrades it — \`brew upgrade --cask copper\` and \`brew reinstall --cask
  # copper\` remain the manual paths.
  auto_updates true

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :sonoma
  depends_on arch: :arm64

  app "Copper.app"
${binaryStanza}
  # Why: the bundle is ad-hoc signed (no Apple Developer ID, no notarization),
  # so Gatekeeper refuses to launch it until the download quarantine flag is
  # cleared. \`postflight_steps\` (Homebrew ≥ 7.0.6) rather than the
  # deprecated \`postflight\` block; \`brew install\` updates Homebrew first.
  postflight_steps do
    run "/usr/bin/xattr", args: ["-cr", "{{appdir}}/Copper.app"]
  end

  # Why: Copper keeps its tab session and settings under its own Application
  # Support dir; WebKit keeps site data under the bundle id. Nothing here is
  # removed by a plain uninstall — only by \`brew uninstall --zap\`.
  zap trash: [
    "~/Library/Application Support/Copper",
    "~/Library/Caches/com.collinrijock.copper",
    "~/Library/HTTPStorages/com.collinrijock.copper",
    "~/Library/Preferences/com.collinrijock.copper.plist",
    "~/Library/Saved Application State/com.collinrijock.copper.savedState",
    "~/Library/WebKit/com.collinrijock.copper",
  ]
end
`
}

export function parseRenderCaskArgs(argv) {
  const parsed = { cli: false }
  const flags = new Map([
    ['--version', 'version'],
    ['--sha256', 'sha256'],
    ['--commit', 'commit'],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--cli') {
      parsed.cli = true
      continue
    }
    if (argument === '--no-cli') {
      parsed.cli = false
      continue
    }
    const key = flags.get(argument)
    if (!key) throw new Error(`unknown argument: ${argument}`)
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`${argument} requires a value`)
    parsed[key] = value
    index += 1
  }
  for (const required of ['version', 'sha256', 'commit']) {
    if (parsed[required] === undefined) {
      throw new Error('usage: render-cask.mjs --version X --sha256 HEX --commit SHA [--cli|--no-cli]')
    }
  }
  return parsed
}

function main() {
  process.stdout.write(renderCopperCask(parseRenderCaskArgs(process.argv.slice(2))))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
