/**
 * Chunked upload complete payload → V2 context voice-note adoption eligibility.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  adoptContextVoiceNoteFromUpload,
  parseContextVoiceNoteFromUploadCompletePayload
} from "@/lib/conversations/context-voice-note-complete";

function readChunkedCompleteRouteSnippet(): string {
  const root = process.cwd();
  return readFileSync(
    path.join(root, "app/api/conversations/upload/chunked/complete/route.ts"),
    "utf8"
  );
}

test("parser: legacy capture payload → no adoption or sync flags", () => {
  assert.deepStrictEqual(
    parseContextVoiceNoteFromUploadCompletePayload({
      leadId: "x",
      storagePath: "y",
      chunkManifest: []
    }),
    {
      adoptAndSyncConversation: false,
      clientLocalNoteId: null,
      durationMs: null
    }
  );
});

test("parser: V2 context + local id → adopt + durations", () => {
  assert.deepStrictEqual(
    parseContextVoiceNoteFromUploadCompletePayload({
      voiceNoteSource: "context",
      voiceNoteLocalId: "local-uuid-1",
      voiceNoteDurationMs: 4250
    }),
    {
      adoptAndSyncConversation: true,
      clientLocalNoteId: "local-uuid-1",
      durationMs: 4250
    }
  );
  assert.deepStrictEqual(
    parseContextVoiceNoteFromUploadCompletePayload({
      voice_note_source: "context",
      voice_note_local_id: "abc",
      duration_seconds: 3
    }),
    {
      adoptAndSyncConversation: true,
      clientLocalNoteId: "abc",
      durationMs: 3000
    }
  );
});

test("parser: snake_case duplicates allowed for client id/source", () => {
  assert.deepStrictEqual(
    parseContextVoiceNoteFromUploadCompletePayload({
      voice_note_source: "context",
      voiceNoteLocalId: "id-42"
    }),
    {
      adoptAndSyncConversation: true,
      clientLocalNoteId: "id-42",
      durationMs: null
    }
  );
});

test("parser: context without stable local id → do not adopt (no V1 dup risk via wrong defaults)", () => {
  assert.deepStrictEqual(
    parseContextVoiceNoteFromUploadCompletePayload({
      voiceNoteSource: "context",
      voiceNoteLocalId: "   "
    }),
    {
      adoptAndSyncConversation: false,
      clientLocalNoteId: null,
      durationMs: null
    }
  );
});

test("parser: capture_initial explicit + local id must not toggle adoption gate", () => {
  assert.equal(
    parseContextVoiceNoteFromUploadCompletePayload({
      voiceNoteSource: "capture_initial",
      voiceNoteLocalId: "x"
    }).adoptAndSyncConversation,
    false
  );
});

test("chunked complete route invokes adoption RPC wrapper + transcription sync flag", () => {
  const src = readChunkedCompleteRouteSnippet();
  assert.match(src, /parseContextVoiceNoteFromUploadCompletePayload/);
  assert.match(src, /finalizeContextVoiceNoteLink/);
  assert.match(src, /adoptContextVoiceNoteFromUpload/);
  assert.match(src, /voiceNoteId:/);
  assert.match(src, /\bvoiceNote\b/);
  assert.match(src, /syncContextVoiceNoteFromConversationIfNeeded/);
  assert.match(src, /voiceNoteContextConversationSync:\s*voiceNoteMeta\.adoptAndSyncConversation/);
});

test("adoption helper calls adopt_voice_note_from_upload RPC shape", async () => {
  const calls: Record<string, unknown>[] = [];

  const noteId = await adoptContextVoiceNoteFromUpload({
    admin: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: "11111111-1111-1111-1111-111111111111", error: null };
      }
    } as any,
    leadId: "22222222-2222-2222-2222-222222222222",
    createdByUserId: "33333333-3333-3333-3333-333333333333",
    conversationId: "44444444-4444-4444-4444-444444444444",
    storagePathAsAudioUrl: "conversations/lead/1.m4a",
    clientLocalNoteId: "local-abc",
    durationMs: 99
  });

  assert.equal(noteId, "11111111-1111-1111-1111-111111111111");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.fn, "adopt_voice_note_from_upload");
  assert.deepStrictEqual((calls[0]?.args ?? {}) as object, {
    p_lead_id: "22222222-2222-2222-2222-222222222222",
    p_created_by_user_id: "33333333-3333-3333-3333-333333333333",
    p_conversation_id: "44444444-4444-4444-4444-444444444444",
    p_audio_url: "conversations/lead/1.m4a",
    p_source: "context",
    p_client_local_note_id: "local-abc",
    p_duration_ms: 99
  });
});

test("adoption helper throws when RPC yields no UUID", async () => {
  await assert.rejects(
    () =>
      adoptContextVoiceNoteFromUpload({
        admin: {
          rpc: async () => ({
            data: "",
            error: null
          })
        } as any,
        leadId: "22222222-2222-2222-2222-222222222222",
        createdByUserId: "33333333-3333-3333-3333-333333333333",
        conversationId: "44444444-4444-4444-4444-444444444444",
        storagePathAsAudioUrl: "x",
        clientLocalNoteId: "note",
        durationMs: null
      }),
    /failed or returned no voice note id/
  );
});

test("signed finalize route also returns canonical voice note payload when context metadata is present", () => {
  const root = process.cwd();
  const src = readFileSync(
    path.join(root, "app/api/conversations/upload/finalize/route.ts"),
    "utf8"
  );
  assert.match(src, /parseContextVoiceNoteFromUploadCompletePayload/);
  assert.match(src, /adoptContextVoiceNoteFromUpload/);
  assert.match(src, /voiceNoteId:/);
  assert.match(src, /\bvoiceNote\b/);
});

test("additional voice-note adoption leaves transcript pending and queues cumulative insight refresh", () => {
  const root = process.cwd();
  const src = readFileSync(
    path.join(root, "supabase/migrations/0073_lead_voice_notes_lifecycle.sql"),
    "utf8"
  );

  assert.match(src, /transcription_status,\s*synthesis_status/s);
  assert.match(src, /'pending',\s*'pending'/);
  assert.match(src, /perform public\.queue_lead_cumulative_insight_regeneration\(p_lead_id\)/);
});
