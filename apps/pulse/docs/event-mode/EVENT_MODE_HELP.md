# EVENTS Mode — Help (Draft)

Draft customer-facing help for EVENTS accounts (`Account.accountType === "EVENTS"`).
This describes the EVENTS event workspace and command center as currently built.
Sections marked **[Needs product review]** describe flows that should be confirmed
with product before publishing.

> EVENTS features only appear for EVENTS accounts. Retail/hospitality and other
> account types see the retail-safe experience and none of the EVENTS surfaces
> below.

---

## Creating an event

**[Needs product review]** Confirm the exact entry point for creating a new event
from the account dashboard. Once an event exists, open its workspace at
**Event → (your event)** to manage everything below.

## Event settings

In the event workspace, open **Event Settings** to edit safe event metadata:

- **Event name**
- **Description**
- **Start date** and **End date**

Click **Save Settings** to apply. These settings are specific to the event
workspace and do not change any retail survey behavior.

## Event setup & operations

The **Event Setup & Operations** card shows your progress across five stages:

1. **Event details** — name and (optionally) schedule.
2. **Structure** — the sessions, areas, sponsor activations, and custom
   touchpoints attendees can give feedback on.
3. **Surveys** — a voice survey for each touchpoint you want feedback on.
4. **Links & QR** — launchable token links and QR codes for each active survey.
5. **Command center** — live attendee feedback monitoring.

Each stage shows a **Ready** or **To do** state. The card also highlights how
many structure touchpoints still need a survey.

## Defining event structure

In **Event Structure**, add the touchpoints attendees can give feedback on:

- **Sessions**
- **Areas / locations**
- **Sponsor activations**
- **Custom touchpoints**

Use **Add Structure Item** to create one, and the archive control to retire one.
A structure item with no survey yet is flagged with a **No survey yet** badge.

## Creating surveys for sessions, areas, and sponsor activations

In the **Surveys** section, use **Create Survey** to add a voice survey. You can
attach a survey to an existing structure item (session, area, sponsor activation,
or custom touchpoint) or define a new target. Pick the question voice and add the
questions attendees will answer aloud.

You can create multiple surveys under one event. Each survey card shows its
status, target, question and response counts.

## Editing, archiving, and restoring surveys

Each survey card has:

- **Edit** — change the selected survey's name, target, questions, and voice.
- **Archive / Restore** — archive a survey to remove it from active launch
  options, or restore it later. Archived surveys show an **Archived** badge and
  are not presented as launchable.

## Sharing QR / token links

For each active survey, the card shows:

- An **Active · launchable** indicator and the **public launch URL**.
- A **Survey QR code** with **View QR**, **Download PNG**, and **Copy Link**.
- **Launch Kiosk** to open the kiosk for that survey.

Each survey has its own token-based link, so you can print or share a distinct QR
per session, area, or sponsor activation. Archived surveys are not shown as
launchable.

## Running live attendee voice capture

Attendees open a survey's kiosk link (or scan its QR) and answer questions aloud.
Responses flow into the event automatically. The kiosk experience itself is shared
infrastructure and is unchanged by EVENTS configuration.

## Using the event command center

Open **View Dashboard** / **Open Command Center** from the event workspace. The
command center shows live event intelligence. EVENTS dashboards include:

- A **Refresh** control and an **Auto-refresh on/off** toggle, with a
  last-updated / "Refreshing…" indicator. Auto-refresh polls on a safe interval
  and stops when you leave the page.
- Survey scope and **Structure** scope selectors (including
  filtering to sponsor activations).

## Reading action briefs

The **Action Briefs** card turns live attendee evidence into operator-ready
items. Each brief shows:

- A **severity** badge and a **sentiment** signal.
- An **evidence count**, a short **summary**, the **affected area**, and a
  **Recommended** action.
- **View evidence** to open the supporting attendee evidence.
- A **status** control to move the brief through New → Investigating →
  Monitoring → Resolved / Dismissed.

When no operational issues have surfaced yet, the card shows a clear empty state.

## Sponsor activation value

The **Sponsor Activation Value** card summarizes feedback for sponsor activation
touchpoints: **mentions**, **sentiment**, top **themes**, and the top **issues**
with representative attendee quotes and an evidence drilldown. It appears once
attendees give feedback on sponsor activation touchpoints; otherwise a clear
empty state is shown.

## Exporting / sharing summaries

From the command center you can copy plain-text summaries for Slack, email, or
internal notes:

- **Copy brief** — copies a single action brief (severity, area, sentiment,
  evidence count, recommended action).
- **Copy event summary** — copies an event-level operations summary listing the
  open action briefs.

These are plain-text copies generated from the data already on screen.

---

## Notes for reviewers

- **[Needs product review]** Event creation entry point and any onboarding flow.
- Retail help docs are unaffected by this draft.
- This draft describes only behavior that is implemented in the EVENTS event
  workspace and command center. Do not describe unbuilt features as available.
