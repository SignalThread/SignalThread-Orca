---
title: "Configure Event Settings"
description: "Edit event details, approval workflows, display labels, reusable requirements, and workspace actions."
category: "Event Planning"
subcategory: ""
slug: "configure-event-settings"
order: 270
status: "published"
audience:
  - "planner"
difficulty: "intermediate"
estimatedReadTime: 6
lastReviewed: "2026-09-04"
tags:
  - "event-settings"
  - "configuration"
related:
  - "use-the-session-workspace"
  - "use-workspace-settings"
sourceRoutes:
  - "/events/{eventId}/settings"
screenshotStatus: "needed"
---

# Configure Event Settings

Configure the selected event without leaving its workspace.

## Overview

**Event Settings** is organized into event details, approval workflows, display terminology, reusable session requirements, built-in session types, and workspace actions. Changes apply only to the event you opened.

Built-in session types are read-only. The page labels this state explicitly and does not offer add, edit, or delete controls.

## Before You Begin

- Confirm that you opened the correct event.
- You need event editor access to save changes. Read-only users can inspect the current configuration.
- Organization-wide terminology is managed separately in account **Settings**.

## Edit Event Details

1. Open an event and select **Settings**.
2. In **Event details**, update the event name, status, start and end dates, time zone, location or venue, or client.
3. Select **Save changes**.
4. If you do not want to keep the unsaved edits, select **Cancel changes**.

The end date cannot be earlier than the start date. Dates are stored as event calendar days.

## Configure Approval Workflows

Use the approval workflow controls to enable or disable new budget and document approval requests for the event. These controls save immediately and do not retroactively change completed decisions.

## Choose Event Display Labels

1. In **Event terminology**, choose an approved display label for Agenda, Run of Show, Matrix, or Show Flow.
2. Select **Save labels**.
3. Select **Discard changes** to restore the last saved labels, or **Use organization labels** to prepare inherited values for saving.

Display terminology changes visible labels only. Routes, API fields, permissions, analytics keys, and stored records remain unchanged.

## Configure Reusable Session Requirements

Open **AV Requirements**, **Staffing**, **Supplies**, or **Signage** to manage reusable sections and items. Return to a session workspace to confirm that the expected requirement structure is available.

## Review Built-in Session Types

Open **Built-in session types** and select **View defaults**. The listed starter types are read-only. Sessions can still retain per-session free-text type values, but event-scoped type administration is not available from this page.

## Workspace Actions

**Workspace actions** contains event-level danger actions, including permanent event deletion. Review the event name and impact carefully before using a destructive action.

## Planner Tips

- Set reusable requirements before detailed production review so sessions follow a consistent checklist.
- Use event terminology for client-specific vocabulary without changing the underlying data model.
- Treat built-in session types as reference values, not an editable taxonomy.

## Troubleshooting

### Save is disabled

Confirm that you have editor access and that at least one value differs from the saved version. A save control remains disabled while a request is in progress.

### A settings card is read-only

The built-in session type list is intentionally read-only. Other settings can also be read-only when your event role does not allow edits.

## Related Articles

- [Use the Session Workspace](use-the-session-workspace.md)
- [Use Workspace Settings](../portfolio/use-workspace-settings.md)

## Screenshots

<!-- SCREENSHOT NEEDED
Route: /events/{eventId}/settings
State: Event Settings overview with event details, approval workflows, terminology, reusable requirement cards, and Built-in session types visible.
Purpose: Orient planners to the settings that apply to one event and the read-only session type state.
Annotation targets:
1. Event details save and cancel controls
2. Event terminology save and discard controls
3. Built-in session types View defaults action
-->
