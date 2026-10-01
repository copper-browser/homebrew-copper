import assert from 'node:assert/strict'
import { test } from 'node:test'

import { caskInputFromManifest } from './bump.mjs'
import { archiveUrl, parseRenderCaskArgs, renderCopperCask } from './render-cask.mjs'

const input = {
  version: '1.0.20261001.1',
  sha256: 'a'.repeat(64),
  commit: '4ef72add55fe294ade8a2199576d0c6d9e4eab4f',
  cli: true,
}

test('renders the versioned GitHub release URL and core stanzas', () => {
  const cask = renderCopperCask(input)
  assert.match(cask, /^cask "copper" do$/m)
  assert.match(cask, /version "1\.0\.20261001\.1"/)
  assert.match(cask, new RegExp(`sha256 "${'a'.repeat(64)}"`))
  // The url stanza interpolates #{version} (so brew audit sees a versioned
  // URL); after Ruby interpolation it equals the immutable release asset.
  const urlStanza = cask.match(/^\s*url "([^"]+)"/m)?.[1]
  assert.equal(
    urlStanza,
    'https://github.com/copper-browser/Copper/releases/download/v#{version}/copper-#{version}-macos-arm64.zip'
  )
  assert.equal(urlStanza.replaceAll('#{version}', input.version), archiveUrl(input))
  assert.match(cask, /depends_on macos: :sonoma/)
  assert.match(cask, /app "Copper\.app"/)
  assert.match(cask, /postflight_steps do\n\s+run "\/usr\/bin\/xattr", args: \["-cr", "\{\{appdir\}\}\/Copper\.app"\]/)
  assert.match(cask, /zap trash:/)
  assert.match(cask, /^\s*auto_updates true$/m)
  assert.match(cask, /livecheck do\n\s+url :url\n\s+strategy :github_latest/)
  assert.doesNotMatch(cask, /exowatt|forca/i)
  assert.ok(cask.endsWith('end\n'))
})

test('binary stanza is rendered only when the build ships the CLI shim', () => {
  assert.match(renderCopperCask(input), /binary "#\{appdir\}\/Copper\.app\/Contents\/Resources\/bin\/copper"/)
  const withoutCli = renderCopperCask({ ...input, cli: false })
  assert.doesNotMatch(withoutCli, /^\s*binary /m)
  assert.match(withoutCli, /No `binary` stanza/)
})

test('rejects malformed inputs', () => {
  assert.throws(() => renderCopperCask({ ...input, version: '1.0' }), /invalid version/)
  assert.throws(() => renderCopperCask({ ...input, version: '1.0.2026092.3' }), /invalid version/)
  assert.throws(() => renderCopperCask({ ...input, sha256: 'A'.repeat(64) }), /invalid sha256/)
  assert.throws(() => renderCopperCask({ ...input, commit: 'abc' }), /invalid commit/)
})

test('argument parsing', () => {
  const parsed = parseRenderCaskArgs([
    '--version', input.version,
    '--sha256', input.sha256,
    '--commit', input.commit,
    '--cli',
  ])
  assert.deepEqual(parsed, input)
  assert.equal(parseRenderCaskArgs([
    '--version', input.version, '--sha256', input.sha256, '--commit', input.commit, '--no-cli',
  ]).cli, false)
  assert.throws(() => parseRenderCaskArgs(['--version', input.version]), /usage/)
  assert.throws(() => parseRenderCaskArgs(['--bogus', 'x']), /unknown argument/)
})

test('manifest → cask input', () => {
  const manifest = {
    product: 'copper',
    version: input.version,
    sha256: input.sha256,
    commit: input.commit,
    hasCli: true,
    zip: `copper-${input.version}-macos-arm64.zip`,
    archiveUrl: archiveUrl(input),
  }
  assert.deepEqual(caskInputFromManifest(manifest), input)
  assert.equal(caskInputFromManifest({ ...manifest, hasCli: false }).cli, false)
  assert.throws(() => caskInputFromManifest({ ...manifest, product: 'forca' }), /not a copper manifest/)
  assert.throws(() => caskInputFromManifest({ ...manifest, zip: 'other.zip' }), /does not match/)
  assert.throws(() => caskInputFromManifest({ ...manifest, archiveUrl: 'https://example.com/x.zip' }), /archiveUrl/)
})
