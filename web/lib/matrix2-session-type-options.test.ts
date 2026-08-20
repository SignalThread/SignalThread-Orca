import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SESSION_TYPE,
  MATRIX2_TEMPLATES,
  SESSION_TYPE_OPTIONS,
  sessionTypeOptionsForSavedValue,
} from "../app/(shell)/matrix-2/_components/types";

test("canonical Session Type options match Create Session labels, values, order, and default", () => {
  assert.equal(DEFAULT_SESSION_TYPE, "Session");
  assert.deepEqual(SESSION_TYPE_OPTIONS, [
    { value: "Session", label: "Session" },
    ...MATRIX2_TEMPLATES.map((template) => ({ value: template.sessionType, label: template.label })),
  ]);
});

test("existing saved Session Type values remain visible without enabling new free text", () => {
  assert.equal(sessionTypeOptionsForSavedValue("Workshop"), SESSION_TYPE_OPTIONS);
  assert.deepEqual(sessionTypeOptionsForSavedValue("Legacy Roundtable").at(-1), {
    value: "Legacy Roundtable",
    label: "Legacy Roundtable",
  });
  assert.equal(sessionTypeOptionsForSavedValue(null)[0].value, DEFAULT_SESSION_TYPE);
});
