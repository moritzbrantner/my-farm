#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v ffmpeg >/dev/null || { echo "ffmpeg is required for asset-tooling PNG encoding" >&2; exit 1; }
pin="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).assetToolingCommit)' "$root/scripts/farm-art-source.json")"
source="$root/.artifacts/asset-tooling-source"
mkdir -p "$(dirname "$source")"
if [[ ! -d "$source/.git" ]]; then
  git clone --no-checkout https://github.com/moritzbrantner/asset-tooling.git "$source"
fi
git -C "$source" fetch origin "$pin"
git -C "$source" checkout --detach "$pin"
test "$(git -C "$source" rev-parse HEAD)" = "$pin"
(
  cd "$source"
  bun install --frozen-lockfile
  export ASSET_TOOLING_BLENDER
  ASSET_TOOLING_BLENDER="$(bun scripts/install-blender.ts "$source/.blender" | tail -n 1)"
  test -x "$ASSET_TOOLING_BLENDER"
  bun examples/tilled-soil/build.ts
  bun examples/wheat/build.ts
)
node "$root/scripts/stage-farm-art.mjs" "$source"
node "$root/scripts/verify-farm-art.mjs"
