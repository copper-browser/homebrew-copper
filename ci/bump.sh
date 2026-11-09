#!/usr/bin/env bash
# Roadrunner's cask bump (.woodpecker/bump.yaml): render Casks/copper.rb from the newest Copper
# release, Ruby-check it, push it to main when it changed. Needs GH_TOKEN (push to this repo).
set -euo pipefail
: "${GH_TOKEN:?GH_TOKEN must be set}"
NODE_VERSION=24.22.2
case "$(uname -m)" in
  x86_64) arch=x64 node_sha=361718c444e49af2ca5a110c83ba6a8901143f23ab285ebbef0341f391f482a9 ;;
  aarch64) arch=arm64 node_sha=95c264150aceb7f3437a29fd6984924f5f8d1511ea3cbd6c508b83f6c555dae2 ;;
  *) echo "bump.sh: unsupported machine $(uname -m)" >&2; exit 1 ;;
esac
cd "$(dirname "$0")/.."
tools=$(mktemp -d)
trap 'rm -rf "$tools"' EXIT
node=node-v$NODE_VERSION-linux-$arch
curl -fsSL --retry 3 --max-time 300 -o "$tools/node.tgz" "https://nodejs.org/dist/v$NODE_VERSION/$node.tar.gz"
echo "$node_sha  $tools/node.tgz" | sha256sum -c --quiet -
tar -xzf "$tools/node.tgz" -C "$tools"

out=$("$tools/$node/bin/node" scripts/bump.mjs)
echo "$out"
version=$(sed -n 's/^version=//p' <<<"$out")
changed=$(sed -n 's/^changed=//p' <<<"$out")
ci-dagger v0.10.1 container-run --src=. --repo=homebrew-copper --apt=ruby \
  --image=public.ecr.aws/docker/library/node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d \
  --run='ruby -c Casks/copper.rb'
if [ "$changed" != true ]; then
  echo "copper ${version} (changed=false)"
  exit 0
fi
git config user.name exowatt-woodpecker-bot
git config user.email 339688546+exowatt-woodpecker-bot@users.noreply.github.com
git add Casks/copper.rb
git commit -q -m "copper ${version}" -m "https://github.com/copper-browser/Copper/releases/tag/v${version}"
# shellcheck disable=SC2016 # $GH_TOKEN is expanded by the helper, not here.
# The token reaches git through a credential helper (never the command line or the remote URL).
GIT_TERMINAL_PROMPT=0 git -c credential.helper= \
  -c credential.helper='!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f' \
  push https://github.com/copper-browser/homebrew-copper.git HEAD:main
echo "copper ${version} (changed=true)"
