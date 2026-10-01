#!/usr/bin/env node

// Re-renders Casks/copper.rb from the newest copper-browser/Copper release.
//
//   node scripts/bump.mjs [--manifest URL] [--out Casks/copper.rb]
//
// Reads the release's copper-version.json (attached by Copper's release.yml),
// checks it against the versioned asset's .sha256 sidecar, renders the cask and
// writes it. Prints `version=<v>` and `changed=true|false` (GITHUB_OUTPUT shape).
// Exits non-zero, writing nothing, on any inconsistency.

import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { RELEASES_URL, archiveUrl, renderCopperCask, zipName } from './render-cask.mjs'

export const DEFAULT_MANIFEST = `${RELEASES_URL}/latest/download/copper-version.json`

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'homebrew-copper-bump' } })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.text()
}

/** Turns a parsed copper-version.json into renderer input, or throws. */
export function caskInputFromManifest(manifest) {
  if (!manifest || manifest.product !== 'copper') throw new Error('manifest is not a copper manifest')
  const { version, sha256, commit, hasCli } = manifest
  if (manifest.zip !== zipName(version)) {
    throw new Error(`manifest zip ${manifest.zip} does not match version ${version}`)
  }
  if (manifest.archiveUrl !== archiveUrl({ version })) {
    throw new Error(`manifest archiveUrl ${manifest.archiveUrl} is not ${archiveUrl({ version })}`)
  }
  return { version, sha256, commit, cli: hasCli === true }
}

async function main(argv) {
  let manifestUrl = DEFAULT_MANIFEST
  let out = 'Casks/copper.rb'
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--manifest') manifestUrl = argv[++index]
    else if (argv[index] === '--out') out = argv[++index]
    else throw new Error(`unknown argument: ${argv[index]}`)
  }

  const manifest = JSON.parse(await fetchText(manifestUrl))
  const input = caskInputFromManifest(manifest)

  const sidecar = await fetchText(`${archiveUrl(input)}.sha256`)
  const published = sidecar.trim().split(/\s+/)[0]
  if (published !== input.sha256) {
    throw new Error(`sha256 sidecar (${published}) disagrees with the manifest (${input.sha256})`)
  }

  const next = renderCopperCask(input)
  let previous = ''
  try {
    previous = await readFile(out, 'utf8')
  } catch {}
  const changed = previous !== next
  if (changed) await writeFile(out, next)
  process.stdout.write(`version=${input.version}\nchanged=${changed}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
