import { strict as assert } from "node:assert";
import { createGableRoofGeometry } from "../src/components/farmScene/assets";

const geometry = createGableRoofGeometry({ width: 1.5, height: 0.5, depth: 1.2 });
const position = geometry.getAttribute("position");
const closeTo = (actual: number, expected: number) => {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} should be close to ${expected}`);
};

assert.equal(position.count, 6);
assert.equal(geometry.index?.count, 24);

geometry.computeBoundingBox();
assert.ok(geometry.boundingBox);
closeTo(geometry.boundingBox.min.x, -0.75);
closeTo(geometry.boundingBox.max.x, 0.75);
closeTo(geometry.boundingBox.min.y, 0);
closeTo(geometry.boundingBox.max.y, 0.5);
closeTo(geometry.boundingBox.min.z, -0.6);
closeTo(geometry.boundingBox.max.z, 0.6);
