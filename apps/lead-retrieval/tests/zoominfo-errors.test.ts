import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapZoomInfoHttpError } from "../lib/integrations/zoominfo/errors";

describe("ZoomInfo error mapping", () => {
  it("401", () => {
    const m = mapZoomInfoHttpError(401, { errors: [{ detail: "Invalid token" }] });
    assert.match(m, /401/);
    assert.match(m, /Invalid token/);
  });

  it("403", () => {
    const m = mapZoomInfoHttpError(403, null);
    assert.match(m, /403/);
  });

  it("429", () => {
    const m = mapZoomInfoHttpError(429, null);
    assert.match(m, /429/);
  });

  it("5xx", () => {
    const m = mapZoomInfoHttpError(503, null);
    assert.match(m, /503/);
    assert.match(m, /server error/i);
  });
});
