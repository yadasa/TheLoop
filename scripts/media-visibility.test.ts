import test from "node:test";
import assert from "node:assert/strict";
import { MediaVisibility } from "../apps/mobile/src/mediaVisibility";
test("closing one photo cannot resume chat reads while another viewer remains open", () => {
  const visibility = new MediaVisibility();
  const values: boolean[] = [];
  const unsubscribe = visibility.subscribe(() => values.push(visibility.getSnapshot()));
  assert.equal(visibility.getSnapshot(), false);
  const closeFirst = visibility.open(), closeSecond = visibility.open();
  assert.equal(visibility.getSnapshot(), true);
  closeFirst(); closeFirst();
  assert.equal(visibility.getSnapshot(), true);
  closeSecond();
  assert.equal(visibility.getSnapshot(), false);
  assert.deepEqual(values, [true, false]);
  unsubscribe();
  visibility.open()();
  assert.deepEqual(values, [true, false]);
});
