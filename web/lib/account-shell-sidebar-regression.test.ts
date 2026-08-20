import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountShellSource = readFileSync("app/(shell)/_components/shell-scaffold.tsx", "utf8");
const eventShellSource = readFileSync(
  "app/(shell)/events/[eventId]/_components/event-workspace-shell.tsx",
  "utf8",
);

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("account shell collapse chevron is owned by the logo header", () => {
  const asideSource = sourceBetween(accountShellSource, "<aside", "</aside>");
  const buttonSource = sourceBetween(
    accountShellSource,
    'onClick={() => setSidebarCollapsed(!storedCollapsed)}',
    "</button>",
  );

  assert.match(asideSource, /fixed inset-y-0 left-0/);
  assert.match(accountShellSource, /isCollapsed \? "flex flex-col items-center gap-3 px-2 py-4" : "px-4 py-4"/);
  assert.match(buttonSource, /isCollapsed \? "" : "absolute right-4 top-1\/2 -translate-y-1\/2"/);
  assert.match(buttonSource, /w-7/);
  assert.match(buttonSource, /rounded-md/);
  assert.doesNotMatch(buttonSource, /top-24/);
  assert.doesNotMatch(buttonSource, /right-0/);
});

test("account shell collapse chevron preserves expanded and collapsed semantics", () => {
  const buttonSource = sourceBetween(
    accountShellSource,
    'onClick={() => setSidebarCollapsed(!storedCollapsed)}',
    "</button>",
  );

  assert.match(buttonSource, /aria-label=\{isCollapsed \? "Expand sidebar" : "Collapse sidebar"\}/);
  assert.match(buttonSource, /title=\{isCollapsed \? "Expand sidebar" : "Collapse sidebar"\}/);
  assert.match(buttonSource, /\{isCollapsed \? <ChevronRight className="h-4 w-4" \/> : <ChevronLeft className="h-4 w-4" \/>\}/);
});

test("event workspace sidebar collapse control is unchanged by account shell fix", () => {
  assert.match(
    eventShellSource,
    /aria-label=\{isCollapsed \? "Expand event sidebar" : "Collapse event sidebar"\}/,
  );
  assert.match(
    eventShellSource,
    /isCollapsed \? "" : "absolute right-4 top-1\/2 -translate-y-1\/2"/,
  );
  assert.match(
    eventShellSource,
    /\{isCollapsed \? <ChevronRight className="h-4 w-4" \/> : <ChevronLeft className="h-4 w-4" \/>\}/,
  );
});
