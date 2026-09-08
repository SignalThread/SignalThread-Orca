import test from "node:test";
import assert from "node:assert/strict";
import { buildLeadInsightRegenerationPrompt } from "@/lib/voice-notes/server/buildLeadInsightRegenerationPrompt";

test("buildLeadInsightRegenerationPrompt includes all transcripted voice notes in chronological order", () => {
  const prompt = buildLeadInsightRegenerationPrompt({
    lead: {
      id: "lead-1",
      fullName: "Alex Morgan",
      email: "alex@example.com",
      jobTitle: "VP Marketing",
      companyText: "Northwind",
      companyDomain: "northwind.com",
      industry: "Software",
      companySize: "201-500",
      seniority: "VP",
      status: "follow_up",
      temperature: "hot",
      priorityScore: 87,
      eventName: "Tech Summit 2026",
      eventLocation: "Boston • MA"
    },
    voiceNotes: [
      {
        id: "note-1",
        recordedAt: "2026-05-20T10:00:00.000Z",
        durationMs: 12000,
        transcript: "First transcript about CRM sync blockers."
      },
      {
        id: "note-2",
        recordedAt: "2026-05-20T11:00:00.000Z",
        durationMs: 9000,
        transcript: "Second transcript about pricing and timeline."
      }
    ]
  });

  const firstIndex = prompt.indexOf("First transcript about CRM sync blockers.");
  const secondIndex = prompt.indexOf("Second transcript about pricing and timeline.");

  assert.match(prompt, /Lead context:/);
  assert.match(prompt, /Voice note 1:/);
  assert.match(prompt, /Voice note 2:/);
  assert.ok(firstIndex >= 0, "first note transcript must be present");
  assert.ok(secondIndex >= 0, "second note transcript must be present");
  assert.ok(firstIndex < secondIndex, "notes must remain in chronological order");
  assert.doesNotMatch(prompt, /Combined conversation summary across selected leads/);
});

test("buildLeadInsightRegenerationPrompt uses the shared RevOps extraction contract", () => {
  const prompt = buildLeadInsightRegenerationPrompt({
    lead: {
      id: "lead-alex",
      fullName: "Alex Morgan",
      email: "alex@northstar.example",
      jobTitle: "Director of Revenue Operations",
      companyText: "Northstar Operations",
      companyDomain: null,
      industry: null,
      companySize: null,
      seniority: null,
      status: "follow_up",
      temperature: "hot",
      priorityScore: 91,
      eventName: "Ops Summit",
      eventLocation: "Las Vegas"
    },
    voiceNotes: [
      {
        id: "note-alex",
        recordedAt: "2026-05-21T12:00:00.000Z",
        durationMs: 90_000,
        transcript:
          "Alex said half the context is gone before CRM entry, reps do not want to spend thirty seconds typing, offline reliability matters at convention centers, managers need visibility into rep follow-up, and budget is allocated this quarter."
      }
    ]
  });

  assert.match(prompt, /enterprise sales intelligence/i);
  assert.match(prompt, /problem_severity/);
  assert.match(prompt, /buying_intent/);
  assert.match(prompt, /operational_pains/);
  assert.match(prompt, /management_visibility_needs/);
  assert.match(prompt, /priority_themes/);
  assert.match(prompt, /half the context is gone/);
  assert.match(prompt, /budget is allocated this quarter/);
  assert.doesNotMatch(prompt, /modern AI-driven platform that captures not only contact info/i);
});
