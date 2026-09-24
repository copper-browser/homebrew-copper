#!/usr/bin/env node

// Renders Casks/copper.rb for the private Homebrew tap (Exowatt-Labs/homebrew-copper).
// .github/workflows/release.yml runs this on every release; the cask is generated,
// never hand-edited. Same shape as config/scripts/render-cask.mjs in Exowatt-Labs/forca.

import { pathToFileURL } from 'node:url'

// <VERSION file>.<YYYYMMDD>.<github.run_number>, e.g. 1.0.20260924.3 — monotonic
// for Homebrew's version comparison even when `fork` is rebased.
const VERSION_PATTERN = /^\d+\.\d+\.\d{8}\.\d+$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/
const COMMIT_PATTERN = /^[0-9a-f]{40}$/

export const FEED_BASE_URL = 'https://forca.apps.exowatt.com'

function assertMatch(label, value, pattern, hint) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`invalid ${label}: ${String(value)} (${hint})`)
  }
}

export function zipName(version) {
  return `copper-${version}-macos-arm64.zip`
}

export function archiveUrl({ version, releaseId }) {
  return `${FEED_BASE_URL}/releases/copper/${releaseId}/downloads/${zipName(version)}`
}

/**
 * @param {{ version: string, sha256: string, releaseId: string, commit: string, cli: boolean }} input
 * @returns {string} the complete Casks/copper.rb text, newline-terminated
 */
export function renderCopperCask({ version, sha256, releaseId, commit, cli }) {
  assertMatch('version', version, VERSION_PATTERN, 'expected MAJOR.MINOR.YYYYMMDD.RUN, e.g. 1.0.20260924.3')
  assertMatch('sha256', sha256, SHA256_PATTERN, 'expected 64 lowercase hex characters')
  assertMatch('release-id', releaseId, RELEASE_ID_PATTERN, 'expected a feed-safe identifier')
  assertMatch('commit', commit, COMMIT_PATTERN, 'expected a full 40-character lowercase SHA')
  if (typeof cli !== 'boolean') throw new Error('cli must be a boolean')

  // Why the immutable URL and not /downloads/copper-latest-macos-arm64.zip: the
  // flat alias is overwritten by the next release, which would make this cask's
  // sha256 fail for anyone who runs `brew install` between a feed publish and
  // the matching tap bump — and would make an older cask revision uninstallable.
  // The release-scoped archive never changes, so the cask stays self-consistent.
  // Rendered with `#{version}` interpolated (Ruby, evaluated by Homebrew) so
  // `brew audit` sees a versioned URL; the commit suffix of the release id is
  // not derivable from the version, so it stays literal.
  if (!releaseId.startsWith(`${version}-g`)) {
    throw new Error(`release-id must be <version>-g<commit12>, got ${releaseId}`)
  }
  const releaseSuffix = releaseId.slice(version.length)
  const url = `${FEED_BASE_URL}/releases/copper/#{version}${releaseSuffix}/downloads/copper-#{version}-macos-arm64.zip`

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

  return `# Rendered by scripts/render-cask.mjs in Exowatt-Labs/homebrew-copper — do not hand-edit
# Built from collinrijock/Copper@${commit} (branch fork).
# Why a plain \`url\`: the archive lives on forca.apps.exowatt.com, which is
# internal-network-only DNS and deliberately not behind SSO, so Homebrew's
# stock curl fetch works — no vendored download strategy, no GitHub token.

cask "copper" do
  version "${version}"
  sha256 "${sha256}"

  url "${url}"
  name "Copper"
  desc "Exowatt's fork of Copper, a native WebKit browser for macOS with a built-in MCP server"
  homepage "https://github.com/collinrijock/Copper"

  # Why: no \`auto_updates\` on purpose — Homebrew IS the macOS update path for
  # Copper. Builds are ad-hoc signed, not notarized, so the app's own updater
  # cannot swap the bundle in place; declaring auto_updates would make
  # \`brew upgrade --cask copper\` a no-op unless the user passed --greedy.
  # No livecheck polling either: the feed is internal-only and the release
  # workflow rewrites this file on every release, so there is nothing for brew
  # to poll. The explicit skip stops \`brew audit --strict\` from guessing a
  # GitHub-tag livecheck off the homepage (which would report Copper's static
  # VERSION file, 1.0, as "latest").
  livecheck do
    skip "versions come from the internal release workflow, not the upstream repo"
  end

  depends_on macos: :sonoma
  depends_on arch: :arm64

  app "Copper.app"
${binaryStanza}
  # Why: the bundle is ad-hoc signed (no Apple Developer ID, no notarization),
  # so Gatekeeper refuses to launch it until the download quarantine flag is
  # cleared — same reasoning as the forca and emu casks. Homebrew ≥ 7.0.6 warns
  # that \`postflight\` is deprecated in favour of \`postflight_steps\`; kept as
  # \`postflight\` deliberately so the cask evaluates on the older Homebrew the
  # team's Macs still run (forca and emu do the same). Flip it in the renderer.
  postflight do
    system_command "/usr/bin/xattr", args: ["-cr", "#{appdir}/Copper.app"]
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
    ['--release-id', 'releaseId'],
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
  for (const required of ['version', 'sha256', 'releaseId', 'commit']) {
    if (parsed[required] === undefined) {
      throw new Error(
        'usage: render-cask.mjs --version X --sha256 HEX --release-id ID --commit SHA [--cli|--no-cli]'
      )
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
