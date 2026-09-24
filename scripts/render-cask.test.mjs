import assert from 'node:assert/strict'
import { test } from 'node:test'

import { archiveUrl, parseRenderCaskArgs, renderCopperCask } from './render-cask.mjs'

const input = {
  version: '1.0.20260924.3',
  sha256: 'a'.repeat(64),
  releaseId: '1.0.20260924.3-g4ef72add55fe',
  commit: '4ef72add55fe294ade8a2199576d0c6d9e4eab4f',
  cli: true,
}

test('renders the immutable feed URL and core stanzas', () => {
  const cask = renderCopperCask(input)
  assert.match(cask, /^cask "copper" do$/m)
  assert.match(cask, /version "1\.0\.20260924\.3"/)
  assert.match(cask, new RegExp(`sha256 "${'a'.repeat(64)}"`))
  // The url stanza interpolates #{version} (so brew audit sees a versioned
  // URL); after Ruby interpolation it equals the immutable archive URL.
  const urlStanza = cask.match(/^\s*url "([^"]+)"/m)?.[1]
  assert.equal(
    urlStanza,
    'https://forca.apps.exowatt.com/releases/copper/#{version}-g4ef72add55fe/downloads/copper-#{version}-macos-arm64.zip'
  )
  assert.equal(urlStanza.replaceAll('#{version}', input.version), archiveUrl(input))
  assert.match(cask, /depends_on macos: :sonoma/)
  assert.match(cask, /app "Copper\.app"/)
  assert.match(cask, /xattr", args: \["-cr"/)
  assert.match(cask, /zap trash:/)
  // The stanzas are intentionally absent (the comments explain why).
  assert.doesNotMatch(cask, /^\s*auto_updates\b/m)
  assert.match(cask, /livecheck do\n\s+skip /)
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
  assert.throws(() => renderCopperCask({ ...input, releaseId: '../x' }), /invalid release-id/)
  assert.throws(() => renderCopperCask({ ...input, releaseId: '9.9.20260101.1-gabc' }), /release-id must be/)
  assert.throws(() => renderCopperCask({ ...input, commit: 'abc' }), /invalid commit/)
})

test('argument parsing', () => {
  const parsed = parseRenderCaskArgs([
    '--version', input.version,
    '--sha256', input.sha256,
    '--release-id', input.releaseId,
    '--commit', input.commit,
    '--cli',
  ])
  assert.deepEqual(parsed, input)
  assert.equal(parseRenderCaskArgs([
    '--version', input.version, '--sha256', input.sha256,
    '--release-id', input.releaseId, '--commit', input.commit, '--no-cli',
  ]).cli, false)
  assert.throws(() => parseRenderCaskArgs(['--version', input.version]), /usage/)
  assert.throws(() => parseRenderCaskArgs(['--bogus', 'x']), /unknown argument/)
})
