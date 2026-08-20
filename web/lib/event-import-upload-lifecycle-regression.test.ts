import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  "app/(shell)/events/_components/new-event-builder.tsx",
  "utf8",
);

test("workbook uploads parse sequentially with honest file-level progress", () => {
  assert.match(
    builderSource,
    /for \(const \[index, file\] of incoming\.entries\(\)\)/,
  );
  assert.doesNotMatch(builderSource, /Promise\.all\(\s*incoming\.map/);
  assert.match(builderSource, /completedFiles: index,/);
  assert.match(builderSource, /totalFiles: incoming\.length,/);
  assert.match(builderSource, /currentFileName: file\.name/);
  assert.match(builderSource, /Reading file \$\{Math\.min\(/);
  assert.match(
    builderSource,
    /Files are read one at a time\. Keep this page open until parsing finishes\./,
  );
  assert.doesNotMatch(builderSource, /percent|percentage|% complete/i);
});

test("workbook parsing prevents overlap and ignores stale completions", () => {
  assert.match(builderSource, /if \(workbookParsingActiveRef\.current\)/);
  assert.match(
    builderSource,
    /Wait for the current spreadsheet to finish before adding another file\./,
  );
  assert.match(
    builderSource,
    /workbookParsingGenerationRef\.current !== parsingGeneration/,
  );
  assert.match(builderSource, /workbookParsingGenerationRef\.current \+= 1/);
  assert.match(
    builderSource,
    /if \(isParsing\) return;\s*void handleWorkbookSelected\(event\.dataTransfer\.files\)/,
  );
  assert.match(builderSource, /disabled=\{isParsing\}/);
  assert.match(
    builderSource,
    /disabled=\{isParsing\}[\s\S]*?removeWorkbookFile\(file\.id\)/,
  );
});

test("failed workbook files retain their File and expose an explicit retry", () => {
  assert.match(
    builderSource,
    /type UploadedWorkbookFile = \{[\s\S]*?file: File;/,
  );
  assert.match(builderSource, /function retryWorkbookFile\(fileId: string\)/);
  assert.match(
    builderSource,
    /handleWorkbookSelected\(\[failedFile\.file\], failedFile\.id\)/,
  );
  assert.match(
    builderSource,
    /onClick=\{\(\) => retryWorkbookFile\(file\.id\)\}/,
  );
  assert.match(builderSource, />\s*Retry\s*<\/button>/);
});

test("creation flow can search and directly enter an existing event", () => {
  assert.match(
    builderSource,
    /fetch\("\/api\/events", \{ credentials: "include", signal: controller\.signal \}\)/,
  );
  assert.match(builderSource, /placeholder="Search existing events"/);
  assert.match(builderSource, /matchingExistingEvents\.map/);
  assert.match(builderSource, /router\.push\(`\/events\/\$\{event\.id\}`\)/);
  assert.match(
    builderSource,
    /Existing events are unavailable\. You can still create a new event\./,
  );
});

test("successful document uploads enter the event while partial failures preserve recovery", () => {
  assert.match(
    builderSource,
    /if \(results\.every\(\(result\) => result\.ok\)\) \{\s*router\.push\(`\/events\/\$\{eventId\}\?created=1`\);/,
  );
  assert.match(
    builderSource,
    /setCreatedEventId\(eventId\);\s*setAdditionalDocResults\(results\);/,
  );
  assert.match(
    builderSource,
    /const mergedResults = additionalDocResults\.map/,
  );
  assert.match(
    builderSource,
    /if \(mergedResults\.every\(\(result\) => result\.ok\)\)/,
  );
  assert.match(builderSource, /AdditionalDocsPostCreatePanel/);
  assert.match(builderSource, /retryFailedAdditionalDocs/);
});
