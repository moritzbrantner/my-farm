import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(root, "scripts/farm-art-source.json"), "utf8"));
const dir = path.join(root, "apps/web/public/farm-art");
const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.assetToolingCommit, config.assetToolingCommit);
assert.equal(manifest.soilPreset, config.soilPreset);
assert.equal(manifest.profile, config.profile);
const expected = [
  ...config.wheatStages.flatMap((stage) => [`wheat-${stage}.glb`, `wheat-${stage}.png`]),
  ...["color", "normal", "roughness"].map((channel) => `${config.soilPreset}-${channel}.png`),
].sort();
assert.deepEqual(Object.keys(manifest.files).sort(), expected);
for (const name of expected) {
  const entry = manifest.files[name];
  assert.ok(entry, name);
  const bytes = await readFile(path.join(dir, name));
  assert.equal(bytes.length, entry.byteLength, name);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256, name);
  assert.equal(entry.source.kind, name.endsWith(".glb") ? "mesh" : "image", name);
  if (entry.source.sha256) assert.equal(entry.source.sha256, entry.sha256);
}
console.log(`Verified ${expected.length} pinned Wheat and Field Plot assets`);
