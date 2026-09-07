import assert from "node:assert/strict";
import test from "node:test";
import { resolveDatePopoverTop } from "@/components/date-field";

test("date popovers open below the trigger when the viewport has room", () => {
  assert.equal(
    resolveDatePopoverTop({
      triggerTop: 100,
      triggerBottom: 144,
      popoverHeight: 300,
      viewportHeight: 720,
    }),
    152,
  );
});

test("date popovers open above low triggers so footer actions remain reachable", () => {
  assert.equal(
    resolveDatePopoverTop({
      triggerTop: 560,
      triggerBottom: 604,
      popoverHeight: 336,
      viewportHeight: 720,
    }),
    216,
  );
});

test("date popovers retain viewport padding when neither side fully fits", () => {
  assert.equal(
    resolveDatePopoverTop({
      triggerTop: 120,
      triggerBottom: 164,
      popoverHeight: 700,
      viewportHeight: 720,
    }),
    8,
  );
});
