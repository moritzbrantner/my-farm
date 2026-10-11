import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(root, "scripts/farm-art-source.json"), "utf8"));
const upstream = path.resolve(process.argv[2] ?? path.join(root, ".artifacts/asset-tooling-source"));
const packageDir = path.join(upstream, ".artifacts/wheat/package");
const manifest = JSON.parse(await readFile(path.join(packageDir, "manifest.json"), "utf8"));
assert.equal(manifest.profile, config.profile);
assert.equal(manifest.schemaVersion, 1);

const selected = [];
for (const stage of config.wheatStages) {
  for (const [kind, extension] of [["mesh", "glb"], ["icon", "png"]]) {
    const entry = manifest.assets.find((asset) => asset.key === `wheat.${kind}` && asset.variant === stage);
    assert.ok(entry, `Missing packaged Wheat ${kind} variant ${stage}`);
    const relative = entry.path;
    assert.match(relative, /^assets\/[0-9a-f]{64}\.(glb|png)$/);
    const bytes = await readFile(path.join(packageDir, relative));
    assert.equal(bytes.length, entry.source.byteLength, relative);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.source.sha256, relative);
    assert.equal(relative.split(".").at(-1), extension);
    const name = `wheat-${stage}.${extension}`;
    selected.push({ name, bytes, source: entry.source });
  }
}
for (const channel of ["color", "normal", "roughness"]) {
  const name = `${config.soilPreset}-${channel}.png`;
  const bytes = await readFile(path.join(upstream, ".artifacts/tilled-soil", name));
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"), name);
  selected.push({ name, bytes, source: { kind: "image", mediaType: "image/png" } });
}
// Publish only after validating the complete selected closure.
for (const asset of selected) {
  if (asset.name.endsWith(".glb")) {
    assert.equal(asset.bytes.toString("ascii", 0, 4), "glTF", asset.name);
  } else {
    assert.deepEqual(asset.bytes.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"), asset.name);
  }
}
const out = path.join(root, "apps/web/public/farm-art");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const files = {};
for (const asset of selected) {
  await writeFile(path.join(out, asset.name), asset.bytes);
  files[asset.name] = {
    sha256: createHash("sha256").update(asset.bytes).digest("hex"),
    byteLength: asset.bytes.length,
    source: asset.source,
  };
}
await writeFile(path.join(out, "manifest.json"), JSON.stringify({
  schemaVersion: 1,
  assetToolingCommit: config.assetToolingCommit,
  soilPreset: config.soilPreset,
  profile: config.profile,
  files,
}, null, 2) + "\n");
console.log(`Staged ${selected.length} verified asset-tooling outputs from ${config.assetToolingCommit}`);
