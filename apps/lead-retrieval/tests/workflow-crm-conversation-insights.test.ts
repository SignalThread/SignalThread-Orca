import test from "node:test";
import assert from "node:assert/strict";
import { loadLatestScopedConversationInsights } from "../lib/workflows/step-handlers/crm-sync-conversation-insights";

function fakeSupabase() {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  return {
    calls,
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          if (table === "lead_conversations" && column === "company_id") {
            throw new Error("lead_conversations.company_id should not be queried");
          }
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          calls.push({ table, filters: [...filters] });
          if (table === "leads") {
            const companyFilter = filters.find(([column]) => column === "company_id")?.[1];
            return companyFilter === "company-1"
              ? { data: { id: "lead-1", company_id: "company-1" }, error: null }
              : { data: null, error: null };
          }
          if (table === "lead_conversations") {
            return {
              data: {
                summary: "Interested in post-event follow-up.",
                objections: ["Timing"],
                next_steps: ["Send details"]
              },
              error: null
            };
          }
          return { data: null, error: null };
        }
      };
      return query;
    }
  };
}

test("CRM conversation insight loader scopes through leads without querying lead_conversations.company_id", async () => {
  const supabase = fakeSupabase();
  const result = await loadLatestScopedConversationInsights(supabase, {
    accountId: "company-1",
    leadId: "lead-1"
  });

  assert.deepEqual(result, {
    summary: "Interested in post-event follow-up.",
    objections: ["Timing"],
    nextSteps: ["Send details"],
    conversationVersion: null,
    generatedAt: null
  });
  assert.deepEqual(supabase.calls.map((call) => call.table), ["leads", "lead_conversations"]);
  assert.deepEqual(supabase.calls[0]?.filters, [
    ["id", "lead-1"],
    ["company_id", "company-1"]
  ]);
  assert.deepEqual(supabase.calls[1]?.filters, [
    ["lead_id", "lead-1"],
    ["synthesis_status", "completed"]
  ]);
});

test("CRM conversation insight loader prevents cross-company access", async () => {
  const supabase = fakeSupabase();
  const result = await loadLatestScopedConversationInsights(supabase, {
    accountId: "company-2",
    leadId: "lead-1"
  });

  assert.equal(result, null);
  assert.deepEqual(supabase.calls.map((call) => call.table), ["leads"]);
});
