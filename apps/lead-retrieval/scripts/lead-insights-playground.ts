/**
 * Local-only developer playground for cumulative lead insights.
 * Not imported by app routes or production server code.
 *
 * Run:
 *   ALLOW_LEAD_INSIGHTS_PLAYGROUND=1 npm run insights:playground -- --transcript path/to/transcript.txt
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as fs from "node:fs";
import path from "node:path";

import { generateLeadInsightsWithOpenAI } from "@/lib/voice-notes/server/leadInsightsGeneration";

const BATCH_INITIAL_RECORDING_COLUMN = "initial_recording";
const BATCH_INITIAL_INSIGHTS_COLUMN = "initial_insights";
const BATCH_CONTEXT_1_COLUMN = "context_1";
const BATCH_NEW_INSIGHTS_AFTER_CONTEXT_1_COLUMN = "new_insights_after_context_1";
const BATCH_CONTEXT_2_COLUMN = "context_2";
const BATCH_NEW_INSIGHTS_AFTER_CONTEXT_2_COLUMN = "new_insights_after_context_2";

const BATCH_OUTPUT_COLUMNS = [
  BATCH_INITIAL_INSIGHTS_COLUMN,
  BATCH_NEW_INSIGHTS_AFTER_CONTEXT_1_COLUMN,
  BATCH_NEW_INSIGHTS_AFTER_CONTEXT_2_COLUMN
] as const;

type SingleModeArgs = {
  mode: "single";
  transcriptPath: string;
  contextPath: string | null;
  outputPath: string | null;
};

type CsvModeArgs = {
  mode: "csv";
  csvPath: string;
  outputPath: string;
};

type CliArgs = SingleModeArgs | CsvModeArgs;

type CsvDocument = {
  headers: string[];
  rows: string[][];
};

type BatchCsvRow = Record<string, string>;

type BatchRowResult = {
  rowNumber: number;
  input: BatchCsvRow;
  generated: {
    initialInsights: Awaited<ReturnType<typeof generateLeadInsightsWithOpenAI>>["insights"] | null;
    newInsightsAfterContext1: Awaited<
      ReturnType<typeof generateLeadInsightsWithOpenAI>
    >["insights"] | null;
    newInsightsAfterContext2: Awaited<
      ReturnType<typeof generateLeadInsightsWithOpenAI>
    >["insights"] | null;
  };
};

async function main(): Promise<void> {
  loadDotEnvLocal();
  requireDevOnlyGate();

  const args = parseArgs(process.argv.slice(2));

  if (args.mode === "csv") {
    await runCsvMode(args);
    return;
  }

  await runSingleMode(args);
}

async function runSingleMode(args: SingleModeArgs): Promise<void> {
  const transcript = await readRequiredTextFile(args.transcriptPath, "--transcript");
  const context = args.contextPath
    ? await readRequiredTextFile(args.contextPath, "--context")
    : null;

  const result = await generateLeadInsightsWithOpenAI({
    transcript,
    context
  });

  console.log(JSON.stringify(result.insights, null, 2));

  if (!args.outputPath) {
    return;
  }

  const absoluteOutputPath = path.resolve(args.outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(
    absoluteOutputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        transcriptPath: path.resolve(args.transcriptPath),
        contextPath: args.contextPath ? path.resolve(args.contextPath) : null,
        model: result.model,
        insights: result.insights,
        request: result.request,
        rawResponse: result.rawResponse
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.error(`Saved full result to ${absoluteOutputPath}`);
}

async function runCsvMode(args: CsvModeArgs): Promise<void> {
  const csvText = await readCsvInputFile(args.csvPath);
  const parsedCsv = parseCsvDocument(csvText);
  const batchRows = mapBatchRows(parsedCsv);
  const results: BatchRowResult[] = [];

  for (let index = 0; index < batchRows.length; index += 1) {
    const rowNumber = index + 2;
    const row = batchRows[index]!;
    const initialRecording = row[BATCH_INITIAL_RECORDING_COLUMN]?.trim() ?? "";
    if (!initialRecording) {
      throw new Error(
        `CSV row ${rowNumber} is missing required ${BATCH_INITIAL_RECORDING_COLUMN}.`
      );
    }

    const context1 = row[BATCH_CONTEXT_1_COLUMN]?.trim() ?? "";
    const context2 = row[BATCH_CONTEXT_2_COLUMN]?.trim() ?? "";
    const cumulativeContexts: string[] = [];

    const initialInsights = await generateInsightsForBatchStage({
      rowNumber,
      outputColumn: BATCH_INITIAL_INSIGHTS_COLUMN,
      transcript: initialRecording,
      contexts: cumulativeContexts
    });

    let newInsightsAfterContext1: BatchRowResult["generated"]["newInsightsAfterContext1"] = null;
    if (context1) {
      cumulativeContexts.push(context1);
      newInsightsAfterContext1 = await generateInsightsForBatchStage({
        rowNumber,
        outputColumn: BATCH_NEW_INSIGHTS_AFTER_CONTEXT_1_COLUMN,
        transcript: initialRecording,
        contexts: cumulativeContexts
      });
    }

    let newInsightsAfterContext2: BatchRowResult["generated"]["newInsightsAfterContext2"] = null;
    if (context2) {
      cumulativeContexts.push(context2);
      newInsightsAfterContext2 = await generateInsightsForBatchStage({
        rowNumber,
        outputColumn: BATCH_NEW_INSIGHTS_AFTER_CONTEXT_2_COLUMN,
        transcript: initialRecording,
        contexts: cumulativeContexts
      });
    }

    results.push({
      rowNumber,
      input: row,
      generated: {
        initialInsights,
        newInsightsAfterContext1,
        newInsightsAfterContext2
      }
    });
  }

  const absoluteOutputPath = path.resolve(args.outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });

  if (absoluteOutputPath.toLowerCase().endsWith(".json")) {
    await writeBatchJsonOutput(absoluteOutputPath, args.csvPath, parsedCsv.headers, results);
  } else {
    await writeBatchCsvOutput(absoluteOutputPath, parsedCsv.headers, batchRows, results);
  }

  console.error(`Saved batch results to ${absoluteOutputPath}`);
}

async function generateInsightsForBatchStage(input: {
  rowNumber: number;
  outputColumn: string;
  transcript: string;
  contexts: string[];
}): Promise<Awaited<ReturnType<typeof generateLeadInsightsWithOpenAI>>["insights"]> {
  try {
    const result = await generateLeadInsightsWithOpenAI({
      transcript: input.transcript,
      context: input.contexts.filter(Boolean).join("\n\n")
    });
    return result.insights;
  } catch (error) {
    throw new Error(
      `OpenAI/API failure for CSV row ${input.rowNumber} (${input.outputColumn}): ${
        error instanceof Error ? error.message : "Unknown API error."
      }`
    );
  }
}

function requireDevOnlyGate(): void {
  if (process.env.ALLOW_LEAD_INSIGHTS_PLAYGROUND !== "1") {
    throw new Error(
      "Refusing to run: set ALLOW_LEAD_INSIGHTS_PLAYGROUND=1 (dev-only guard)."
    );
  }

  if (String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    throw new Error("Refusing to run in NODE_ENV=production.");
  }
}

function loadDotEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    if (!line.includes("=") || line.trim().startsWith("#")) {
      continue;
    }

    const [rawKey, ...rest] = line.split("=");
    const key = rawKey?.trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = rest.join("=").trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseArgs(argv: string[]): CliArgs {
  let transcriptPath: string | null = null;
  let contextPath: string | null = null;
  let csvPath: string | null = null;
  let outputPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    }
    if (token === "--transcript") {
      transcriptPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--context") {
      contextPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--csv") {
      csvPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === "--out") {
      outputPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (csvPath) {
    if (transcriptPath || contextPath) {
      throw new Error("Use either --csv mode or --transcript/--context mode, not both.");
    }

    return {
      mode: "csv",
      csvPath,
      outputPath: outputPath ?? "./tmp/insight-results.csv"
    };
  }

  if (!transcriptPath) {
    throw new Error("Missing required --transcript path.");
  }

  return {
    mode: "single",
    transcriptPath,
    contextPath,
    outputPath
  };
}

async function readCsvInputFile(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown file error.";
    throw new Error(`Missing CSV file or unable to read it at ${absolutePath}: ${message}`);
  }
}

async function readRequiredTextFile(filePath: string, flagName: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read ${flagName} file at ${absolutePath}: ${
        error instanceof Error ? error.message : "Unknown file error."
      }`
    );
  }

  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new Error(`${flagName} file is empty: ${absolutePath}`);
  }
  return normalized;
}

function parseCsvDocument(text: string): CsvDocument {
  const normalized = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          cell += '"';
          index += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cell += char;
      continue;
    }

    if (char === '"') {
      if (cell.length > 0) {
        throw new Error("Malformed CSV: unexpected quote inside an unquoted field.");
      }
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\r") {
      if (normalized[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unterminated quoted field.");
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((candidate) =>
    candidate.some((value) => value.trim().length > 0)
  );
  if (nonEmptyRows.length === 0) {
    throw new Error("Malformed CSV: file is empty.");
  }

  const headers = nonEmptyRows[0]!.map((header) => header.trim());
  if (headers.length === 0 || headers.every((header) => !header)) {
    throw new Error("Malformed CSV: header row is empty.");
  }

  const dataRows = nonEmptyRows.slice(1).map((candidate, rowIndex) => {
    if (candidate.length > headers.length) {
      throw new Error(
        `Malformed CSV: row ${rowIndex + 2} has ${candidate.length} columns but header has ${headers.length}.`
      );
    }

    const padded = [...candidate];
    while (padded.length < headers.length) {
      padded.push("");
    }
    return padded;
  });

  return {
    headers,
    rows: dataRows
  };
}

function mapBatchRows(document: CsvDocument): BatchCsvRow[] {
  return document.rows.map((cells) => {
    const row: BatchCsvRow = {};
    for (let index = 0; index < document.headers.length; index += 1) {
      row[document.headers[index]!] = cells[index] ?? "";
    }
    return row;
  });
}

async function writeBatchCsvOutput(
  outputPath: string,
  inputHeaders: string[],
  batchRows: BatchCsvRow[],
  results: BatchRowResult[]
): Promise<void> {
  const outputHeaders = [...inputHeaders];
  for (const column of BATCH_OUTPUT_COLUMNS) {
    if (!outputHeaders.includes(column)) {
      outputHeaders.push(column);
    }
  }

  const lines = [outputHeaders.map(escapeCsvCell).join(",")];
  for (let index = 0; index < batchRows.length; index += 1) {
    const row = { ...batchRows[index]! };
    const generated = results[index]!.generated;

    row[BATCH_INITIAL_INSIGHTS_COLUMN] = generated.initialInsights
      ? JSON.stringify(generated.initialInsights)
      : row[BATCH_INITIAL_INSIGHTS_COLUMN] ?? "";
    row[BATCH_NEW_INSIGHTS_AFTER_CONTEXT_1_COLUMN] = generated.newInsightsAfterContext1
      ? JSON.stringify(generated.newInsightsAfterContext1)
      : row[BATCH_NEW_INSIGHTS_AFTER_CONTEXT_1_COLUMN] ?? "";
    row[BATCH_NEW_INSIGHTS_AFTER_CONTEXT_2_COLUMN] = generated.newInsightsAfterContext2
      ? JSON.stringify(generated.newInsightsAfterContext2)
      : row[BATCH_NEW_INSIGHTS_AFTER_CONTEXT_2_COLUMN] ?? "";

    lines.push(outputHeaders.map((header) => escapeCsvCell(row[header] ?? "")).join(","));
  }

  await writeFile(outputPath, `${lines.join("\r\n")}\r\n`, "utf8");
}

async function writeBatchJsonOutput(
  outputPath: string,
  csvPath: string,
  inputHeaders: string[],
  results: BatchRowResult[]
): Promise<void> {
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        csvPath: path.resolve(csvPath),
        headers: inputHeaders,
        rows: results.map((result) => ({
          rowNumber: result.rowNumber,
          input: result.input,
          generated: result.generated
        }))
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

function escapeCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function printUsage(): void {
  console.error(
    [
      "Usage:",
      "  ALLOW_LEAD_INSIGHTS_PLAYGROUND=1 npm run insights:playground -- --transcript path/to/transcript.txt [--context path/to/context.txt] [--out path/to/output.json]",
      "  ALLOW_LEAD_INSIGHTS_PLAYGROUND=1 npm run insights:playground -- --csv ./tmp/insight-tests.csv [--out ./tmp/insight-results.csv]",
      "",
      "CSV columns:",
      `  ${BATCH_INITIAL_RECORDING_COLUMN}`,
      `  ${BATCH_INITIAL_INSIGHTS_COLUMN}`,
      `  ${BATCH_CONTEXT_1_COLUMN}`,
      `  ${BATCH_NEW_INSIGHTS_AFTER_CONTEXT_1_COLUMN}`,
      `  ${BATCH_CONTEXT_2_COLUMN}`,
      `  ${BATCH_NEW_INSIGHTS_AFTER_CONTEXT_2_COLUMN}`,
      "",
      "Environment:",
      "  ALLOW_LEAD_INSIGHTS_PLAYGROUND  required dev-only guard",
      "  OPENAI_API_KEY                  required",
      "  LEAD_INSIGHTS_OPENAI_MODEL      optional",
      "  OPENAI_MODEL                    optional fallback model name",
      "  OPENAI_BASE_URL                 optional API base URL",
      "  OPENAI_ORG_ID                   optional",
      "  OPENAI_PROJECT_ID               optional"
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(
    `[lead-insights-playground] ${error instanceof Error ? error.message : "Unknown error."}`
  );
  process.exitCode = 1;
});
