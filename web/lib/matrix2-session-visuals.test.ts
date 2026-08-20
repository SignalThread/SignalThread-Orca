import assert from "node:assert/strict";
import test from "node:test";
import {
  matrix2SessionCardTypeClasses,
  matrix2SessionTypeBadgeClasses,
  matrix2SessionVisualTone,
} from "./matrix2-session-visuals";

test("Run of Show maps session types to the canonical restrained operations palette", () => {
  const cases = [
    ["Keynote", "keynote", "border-l-violet-500"],
    ["General Session", "keynote", "border-l-violet-500"],
    ["Breakout", "breakout", "border-l-sky-500"],
    ["Panel Discussion", "breakout", "border-l-sky-500"],
    ["Networking Reception", "networking", "border-l-fuchsia-500"],
    ["Lunch", "meal", "border-l-amber-500"],
    ["Registration Open", "registration", "border-l-teal-500"],
    ["Expo Hall", "expo", "border-l-cyan-500"],
    ["VIP Executive Briefing", "vip", "border-l-indigo-500"],
  ] as const;

  for (const [sessionType, tone, railClass] of cases) {
    assert.equal(matrix2SessionVisualTone(sessionType), tone, sessionType);
    const cardClasses = matrix2SessionCardTypeClasses(sessionType);
    assert.match(cardClasses, new RegExp(railClass));
    assert.match(cardClasses, /border-l-4/);
    assert.match(cardClasses, /bg-(violet|sky|fuchsia|amber|teal|cyan|indigo)-50\/75/);
    assert.doesNotMatch(cardClasses, /shadow-|ring-|rose-/);
    assert.match(matrix2SessionTypeBadgeClasses(sessionType), /bg-/);
  }
});

test("Run of Show uses a neutral fallback for unknown session types", () => {
  assert.equal(matrix2SessionVisualTone("Custom session"), "default");
  assert.equal(
    matrix2SessionCardTypeClasses("Custom session"),
    "border-l-4 border-l-slate-400 bg-slate-50/75 text-slate-900",
  );
});
