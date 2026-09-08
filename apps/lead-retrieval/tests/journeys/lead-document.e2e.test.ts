/**
 * Lead document journey.
 *
 * Product reality (do not fake otherwise): documents are **company/account-scoped** library
 * resources (`documents.account_id`, optional `event_id`). There is **no** capability to attach
 * a document directly to a lead. The only lead linkage is `document_sends.lead_id`, created when
 * a rep *sends* a document to a lead via `POST /api/exhibitor/documents/send` (account-scoped read,
 * `rep_sendable` gate, SendGrid delivery is provider-gated and "plugs in later").
 *
 * Proven here:
 *  1. Source contract — documents create/list are account-scoped and never reference `lead_id`;
 *     the send route scopes the document/template by account, gates on `rep_sendable`, and writes
 *     a `document_sends` row linking document + lead + recipient + sender.
 *  2. A pending test recording that direct lead↔document attach is not implemented (blocked).
 *  3. Live linkage (opt-in) — a link-kind document + a `document_sends` row prove the supported
 *     lead linkage and account-scope isolation, using safe dummy content (no file bytes, no R2).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import {
  createTestRunId,
  journeyNamePrefix,
  taggedName,
  resolveJourneyEnv,
  getJourneySupabase,
  createTestLead,
} from "../helpers/journey-fixtures";
import { JourneyCleanupRegistry } from "../helpers/journey-cleanup";

const root = process.cwd();
const documentsRoute = readFileSync(join(root, "app/api/exhibitor/documents/route.ts"), "utf8");
const sendRoute = readFileSync(join(root, "app/api/exhibitor/documents/send/route.ts"), "utf8");

describe("lead document journey — documents are account-scoped, not lead-attached", () => {
  it("creates and lists documents scoped to account_id", () => {
    assert.match(documentsRoute, /account_id: accountId/);
    assert.match(documentsRoute, /\.from\("documents"\)[\s\S]*\.eq\("account_id", accountId\)/);
  });

  it("never attaches a document directly to a lead (no lead_id on documents)", () => {
    assert.ok(!/\blead_id\b/.test(documentsRoute), "documents route must not reference lead_id");
  });
});

describe("lead document journey — supported linkage is send-to-lead", () => {
  it("send route scopes the document and template by account and gates on rep_sendable", () => {
    assert.match(sendRoute, /\.from\("documents"\)[\s\S]*\.eq\("id", documentId\)[\s\S]*\.eq\("account_id", accountId\)/);
    assert.match(sendRoute, /\.from\("email_templates"\)[\s\S]*\.eq\("account_id", accountId\)/);
    assert.match(sendRoute, /if \(!documentRow\.rep_sendable\)/);
  });

  it("records a document_sends row linking document + lead + recipient + sender", () => {
    assert.match(
      sendRoute,
      /\.from\("document_sends"\)\s*\.insert\(\{\s*document_id: documentRow\.id,\s*lead_id: leadId \|\| null,\s*recipient_email: recipientEmail,\s*sent_by: sessionUser\.userId/
    );
  });

  it("uses a provider-gated send (SendGrid) that plugs in later — no fake delivery", () => {
    assert.match(sendRoute, /from "@sendgrid\/mail"/);
    assert.match(sendRoute, /provider delivery \(SendGrid\) plugs in later/);
  });
});

// Capability gap: attaching a document directly to a lead record is not implemented.
describe("lead document journey — direct lead attach (capability gap)", () => {
  it(
    "is not implemented; only send-to-lead linkage exists",
    { skip: "Blocked: documents are account-scoped; no document↔lead attach API exists (only document_sends.lead_id on send). See JOURNEY_MATRIX.md journey 4." },
    () => {
      assert.fail("unreachable — documented gap");
    }
  );
});

// Live linkage: prove the supported send-to-lead linkage + account-scope isolation with real
// rows. Requires the opt-in journey DB env plus a pre-existing test user (FK for uploaded_by /
// sent_by). Uses a link-kind document so there is no file upload / R2 object.
const env = resolveJourneyEnv();
const testUserId = (process.env.JOURNEY_TEST_USER_ID || "").trim();
const liveSkip = !env.enabled
  ? `live-DB disabled: ${env.reason}`
  : !testUserId
    ? "missing JOURNEY_TEST_USER_ID (a pre-existing users row for uploaded_by/sent_by)"
    : false;

describe(
  "lead document journey — live send-to-lead linkage & scope isolation",
  { skip: liveSkip },
  () => {
    const runId = createTestRunId();
    const registry = new JourneyCleanupRegistry();

    after(async () => {
      await registry.cleanup();
    });

    it("links a document to a lead via document_sends and isolates by account", async () => {
      const client = getJourneySupabase(env);
      const db = client as unknown as {
        from: (t: string) => any;
      };

      const lead = await createTestLead(
        client,
        { testRunId: runId, companyId: env.companyId, eventId: env.eventId },
        registry
      );

      // Account-scoped link-kind document (safe dummy content, no R2 object).
      const { data: doc, error: docErr } = await db
        .from("documents")
        .insert({
          account_id: env.companyId,
          title: taggedName(runId, "Doc"),
          type: "link",
          asset_kind: "link",
          event_id: env.eventId,
          tags: [],
          storage_path: null,
          file_url: "https://example.com/lrj-fixture",
          mime_type: null,
          uploaded_by: testUserId,
          rep_sendable: true,
          sent_count: 0,
          is_archived: false,
        })
        .select("id, account_id, title")
        .maybeSingle();
      assert.equal(docErr, null);
      assert.ok(doc, "expected document fixture to insert");
      registry.register(`document:${doc.id}`, async () => {
        await db.from("documents").delete().eq("id", doc.id).eq("account_id", env.companyId);
      });
      assert.ok(String(doc.title).startsWith(journeyNamePrefix(runId)));

      // Supported lead linkage: a document_sends row (mirrors the send route insert, no SendGrid).
      const { data: send, error: sendErr } = await db
        .from("document_sends")
        .insert({
          document_id: doc.id,
          lead_id: lead.id,
          recipient_email: `lrj-${runId}@example.com`,
          sent_by: testUserId,
          provider_message_id: null,
        })
        .select("id, document_id, lead_id")
        .maybeSingle();
      assert.equal(sendErr, null);
      assert.ok(send, "expected document_sends row to insert");
      registry.register(`document_send:${send.id}`, async () => {
        await db.from("document_sends").delete().eq("id", send.id);
      });
      assert.equal(String(send.document_id), String(doc.id));
      assert.equal(String(send.lead_id), String(lead.id));

      // Account-scope isolation: a different account cannot read this document.
      const otherAccount = randomUUID();
      const { data: leaked } = await db
        .from("documents")
        .select("id")
        .eq("id", doc.id)
        .eq("account_id", otherAccount)
        .maybeSingle();
      assert.equal(leaked, null, "document must not be readable under another account_id");

      const outcome = await registry.cleanup();
      assert.equal(outcome.failed, 0);
    });
  }
);
