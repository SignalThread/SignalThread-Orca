# Pre-Sales Briefs

Pre-Sales Briefs turn captured lead context into a quick sales-ready summary so reps can understand who the lead is, what they care about, why they may be a fit, and what follow-up angle to use before reaching out.

A brief is preparation help. It does not replace human review.

---

## What a Pre-Sales Brief Is

A Pre-Sales Brief is a structured summary for a lead. Depending on available source data, it can include:

- A person and company snapshot
- Why the lead may matter for this event
- Suggested talking points
- Questions to ask
- Competitive or market context
- Cues to watch during follow-up
- Open questions or missing context

The brief should help a rep prepare faster before emailing, calling, or meeting with the lead.

---

## How Briefs Are Created

In the current Admin Portal, briefs are created and reviewed through AI Briefings workspaces.

Common creation paths include:

- Creating a briefing workspace from an import run
- Creating a briefing workspace from selected existing leads
- Preparing batch notes or per-lead context
- Reviewing and approving brief drafts

After a brief is approved, approved brief content can be synced to the lead record so it appears with that lead.

---

## Where to Find a Brief

Open the lead record in the Admin Portal and look for the lead's brief area. Some surfaces may label this as a Pre-Show Brief or AI Brief while the product language moves toward Pre-Sales Briefs.

The lead list may also show a brief link only when a renderable approved brief exists for that lead.

If no approved brief is available, the lead page may show that the brief is not ready or pending.

---

## What Lead Data Is Used

The brief is grounded in captured lead context. Verified source paths include:

- Lead name, email, title, company, and related company details
- Imported lead rows and field mapping
- Batch notes and per-lead context added in the briefing workspace
- Approved or edited brief content from the review step
- Event-level briefing strategy and context configured for AI Briefings
- Enrichment data when it is available in the lead or import workflow

Voice notes and conversation insights may help the broader lead record, but the lead-level brief endpoint reads approved stored brief content. Product question: confirm whether new voice notes should automatically refresh an existing Pre-Sales Brief.

Campaign Agents help shape campaign drafts. They are not the same thing as Pre-Sales Briefs, and no direct automatic Campaign Agent contribution to Pre-Sales Brief generation was found in this pass.

---

## How to Use a Brief Before Follow-Up

Before outreach:

1. Read the summary and key context.
2. Check the lead's role, company, rating, temperature, and notes.
3. Review suggested questions and talking points.
4. Compare the brief against what your team actually learned.
5. Use the brief to write a sharper follow-up email, prepare for a call, or plan a meeting.

Do not send or repeat brief content without reviewing it.

---

## Review Before Relying on It

Check for:

- Wrong or missing name, company, title, or email
- Context that belongs to another event or lead
- Outdated event details
- Missing notes from the latest conversation
- Generic wording that needs a rep's judgment
- Open questions that should be confirmed before outreach

If something looks wrong, update the lead record or briefing workspace context and review the draft again.

---

## Missing, Incomplete, Stale, or Wrong Briefs

**The brief is missing.**
The lead may not have an approved brief yet. Create or open an AI Briefings workspace, prepare the lead context, review the draft, and approve it.

**The brief is incomplete.**
Add more batch notes, per-lead context, or corrected lead details in the briefing workflow, then review the brief again.

**The brief looks stale.**
Current code stores approved brief content on the lead. It should not be assumed to update automatically every time a lead changes. Product question: confirm the intended regenerate or refresh workflow for already-approved lead briefs.

**The brief is wrong.**
Correct the source lead details or briefing notes, then create/review a corrected brief. Do not rely on a brief that conflicts with known lead context.

---

## Permissions

Pre-Sales Brief access follows the company and event access assigned to the user. Exhibitor Admins can use briefing workflows for their company/event scope. Users outside the company/event scope should not be able to view or create briefs for those leads.

---

## Related Articles

- [Lead Management](lead-import.md)
- [Campaign Builder](../campaigns-follow-up/campaign-builder.md)
- [Campaign Agents](../campaigns-follow-up/campaign-agents.md)
- [Campaign Troubleshooting FAQ](../campaigns-follow-up/troubleshooting-faq.md)
