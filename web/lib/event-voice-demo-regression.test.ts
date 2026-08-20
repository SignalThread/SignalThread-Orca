import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const webRoot = path.resolve(process.cwd());
const read = (relativePath: string) => fs.readFileSync(path.join(webRoot, relativePath), "utf8");

test("Voice demo uses one allowlisted event ID for both route access and navigation", () => {
  const allowlist = read("lib/event-voice-demo.ts");
  const route = read("app/(shell)/events/[eventId]/voice/page.tsx");
  const shell = read("app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx");

  assert.match(allowlist, /VOICE_DEMO_EVENT_ID = "717ca942-5701-4bfb-82e7-afddf41f19a7"/);
  assert.match(allowlist, /return eventId === VOICE_DEMO_EVENT_ID/);
  assert.match(route, /isVoiceDemoEvent\(eventId\)/);
  assert.match(route, /if \(!isVoiceDemoEvent\(eventId\)\) notFound\(\)/);
  assert.match(shell, /isVoiceDemoEvent\(eventId\)/);
  assert.match(shell, /label: "Voice"/);
});

test("Voice content is static, event-aware, and keeps demo actions non-persistent", () => {
  const content = read("app/(shell)/events/[eventId]/voice/_components/event-voice-demo.tsx");

  assert.match(content, /label: "All Events", href: "\/events"/);
  assert.match(content, /label: eventName, href: `\/events\/\$\{eventId\}`/);
  assert.match(content, /Capture attendee feedback and uncover what matters most/);
  assert.match(content, /Active voice experiences/);
  assert.match(content, /Recent feedback/);
  assert.match(content, /What attendees are talking about/);
  assert.match(content, /Voice settings/);
  assert.match(content, /More actions for/);
  assert.match(content, /Response trend sparkline/);
  assert.match(content, /May 12/);
  assert.match(content, /Demo only/);
  assert.doesNotMatch(content, /fetch\(/);
});
