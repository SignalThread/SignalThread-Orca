import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath,
} from "@/lib/internal-health/internal-health-auth";
import {
  getLeadRetrievalProviderFailureSpikesHealth,
  CRITICAL_FAILURE_COUNT,
} from "@/lib/internal-health/lead-retrieval/provider-failure-spikes";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const PATHNAME = "/api/internal/health/lead-retrieval/provider-failure-spikes";
const SECRET = "internal-health-secret";
const NOW = "2026-06-30T12:00:00.000Z";
const RECENT = "2026-06-30T11:30:00.000Z"; // within 60m

function headers(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

describe("provider-failure-spikes signing", () => {
  it("accepts a valid signature for this path", () => {
    const timestamp = "1782820800000";
    const signature = signInternalHealthPath({ secret: SECRET, timestamp, pathname: PATHNAME });
    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({
          "x-internal-health-timestamp": timestamp,
          "x-internal-health-signature": signature,
        }),
        pathname: PATHNAME,
        secret: SECRET,
        nowMs: Number(timestamp),
      }),
      { ok: true }
    );
  });
});

describe("getLeadRetrievalProviderFailureSpikesHealth", () => {
  it("is healthy when successes flow and there are no actionable failures", async () => {
    const fake = createFakeSupabase({
      lead_conversations: Array.from({ length: 5 }, (_, i) => ({
        id: `c-${i}`,
        transcription_status: "completed",
        synthesis_status: "completed",
        transcript: "real content",
        created_at: RECENT,
      })),
    });
    const health = await getLeadRetrievalProviderFailureSpikesHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.check, "provider-failure-spikes");
    assert.equal(health.source, "provider-failure-spikes");
    assert.equal(health.status, "healthy");
    assert.equal(health.metrics.transcriptionSuccesses60m, 5);
    assert.equal(health.metrics.transcriptionFailures60m, 0);
    assert.deepEqual(health.issues, []);
    assert.doesNotMatch(JSON.stringify(health), /real content/);
  });

  it("marks transcription provider failures critical when spiking with no successes", async () => {
    const fake = createFakeSupabase({
      lead_conversations: Array.from({ length: CRITICAL_FAILURE_COUNT }, (_, i) => ({
        id: `c-${i}`,
        transcription_status: "failed",
        synthesis_status: "pending",
        transcript: null,
        created_at: RECENT,
      })),
    });
    const health = await getLeadRetrievalProviderFailureSpikesHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.transcriptionFailures60m, CRITICAL_FAILURE_COUNT);
    assert.equal(health.metrics.transcriptionSuccesses60m, 0);
    assert.equal(health.status, "critical");
    assert.ok(health.issues.some((i) => i.code === "transcription_provider_failures" && i.severity === "critical"));
  });

  it("stays warning when failures are elevated but successes continue", async () => {
    const fake = createFakeSupabase({
      lead_conversations: [
        ...Array.from({ length: 3 }, (_, i) => ({ id: `f-${i}`, transcription_status: "failed", synthesis_status: "pending", transcript: null, created_at: RECENT })),
        ...Array.from({ length: 7 }, (_, i) => ({ id: `s-${i}`, transcription_status: "completed", synthesis_status: "completed", transcript: "x", created_at: RECENT })),
      ],
    });
    const health = await getLeadRetrievalProviderFailureSpikesHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.transcriptionFailures60m, 3);
    assert.equal(health.metrics.transcriptionSuccesses60m, 7);
    assert.equal(health.status, "warning");
    assert.ok(health.issues.some((i) => i.code === "transcription_provider_failures" && i.severity === "warning"));
  });

  it("excludes empty/no-speech recordings from actionable synthesis failures", async () => {
    const fake = createFakeSupabase({
      lead_conversations: Array.from({ length: CRITICAL_FAILURE_COUNT }, (_, i) => ({
        id: `ns-${i}`,
        transcription_status: "completed",
        synthesis_status: "failed",
        transcript: "",
        created_at: RECENT,
      })),
    });
    const health = await getLeadRetrievalProviderFailureSpikesHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.noSpeechCount60m, CRITICAL_FAILURE_COUNT);
    assert.equal(health.metrics.synthesisFailures60m, 0); // actionable, no-speech excluded
    assert.equal(health.status, "healthy");
    assert.ok(!health.issues.some((i) => i.code === "synthesis_provider_failures"));
  });

  it("route contract: GET only, authenticates before DB, no transcript/error columns selected", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/health/lead-retrieval/provider-failure-spikes/route.ts"),
      "utf8"
    );
    const service = readFileSync(
      join(process.cwd(), "lib/internal-health/lead-retrieval/provider-failure-spikes.ts"),
      "utf8"
    );
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
    assert.ok(route.indexOf("authorizeLeadRetrievalInternalHealthRequest") < route.indexOf("createAdminClient"));
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
    assert.doesNotMatch(service, /select:\s*"[^"]*\b(transcript|summary|transcription_error|synthesis_error|audio_url|storage_path)\b[^"]*"/);
  });
});
