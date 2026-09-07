---
title: "Manage Registration Agenda"
description: "Stage attendee-facing agenda entries from official Run of Show sessions, spreadsheets, or manual entry."
category: "Event Planning"
subcategory: ""
slug: "manage-registration-agenda"
order: 225
status: "published"
audience:
  - "planner"
difficulty: "intermediate"
estimatedReadTime: 7
lastReviewed: "2026-09-04"
tags:
  - "registration"
  - "agenda"
  - "showops"
related:
  - "use-the-run-of-show"
  - "spreadsheet-import-problems"
  - "use-the-directory"
sourceRoutes:
  - "/events/{eventId}/registration/agenda"
screenshotStatus: "needed"
---

# Manage Registration Agenda

Prepare the attendee-facing agenda in a dedicated Registration staging workspace.

## Overview

**Reg Agenda** owns staged attendee-facing agenda entries. You can import sessions designated **Official agenda** in Run of Show, upload a spreadsheet, or create entries manually.

The current adapter stores entries inside Orca. It does not publish to an external registration provider, and the interface reports external synchronization as unavailable rather than implying success.

## Before You Begin

- Confirm that approved attendee-facing sessions are marked **Official agenda** in Run of Show.
- Clean session titles, dates, times, rooms, descriptions, tracks, and speaker information before import.
- You need event editor access to create, edit, publish, unpublish, archive, or import entries.

## Import Official ShowOps Sessions

1. Open the event and select **Reg Agenda**.
2. Select **Import official ShowOps sessions**.
3. Review imported, updated, unchanged, archived, warning, and error counts.
4. Resolve validation warnings before publishing entries.

The import is idempotent: unchanged sessions are not duplicated, and changed sessions update the existing staged entry. If an imported session is later unmarked in Run of Show, the next import archives and unpublishes its staged entry.

## Import a Spreadsheet

1. Choose a CSV, XLS, or XLSX file.
2. Review the detected column mapping and preview rows.
3. Correct invalid rows or mapping problems.
4. Confirm the import.

Imports recognize common agenda column names and report duplicates instead of silently creating repeated entries. Files are limited to 1,000 rows.

## Create or Edit an Entry Manually

Use manual entry for attendee-facing content that does not originate in Run of Show. Enter the title, date, start and end times, and other available details, then save. Open an existing entry to edit its staged values.

## Publish and Unpublish

Publish makes a valid staged entry available to Registration Agenda consumers inside Orca. Unpublish returns it to draft without deleting it. Remove archives the staged entry after confirmation.

Publishing here does not synchronize to an external registration platform. External publication remains unavailable until a provider adapter is configured.

## Attach a PDF Reference

You can attach a valid PDF as source reference metadata. Orca records the filename and type but does not extract agenda entries from the PDF. Use manual entry or a spreadsheet when structured import is required.

## Planner Tips

- Treat Run of Show as operational truth and Reg Agenda as attendee-facing staging.
- Re-run the ShowOps import after official session or speaker details change.
- Review warnings rather than assuming every staged entry is ready to publish.
- Use stable source IDs and clean spreadsheet rows to minimize duplicates.

## Troubleshooting

### An expected session was not imported

Open the session in Run of Show and confirm **Include in official agenda** is selected. Internal-only sessions are intentionally excluded.

### A spreadsheet row is invalid

Review the preview's field mapping and row-level validation. Correct the source file, then preview it again before confirming.

### External sync did not occur

This environment uses Orca's internal Registration staging adapter. No external provider sync is performed or reported as successful.

## Related Articles

- [Use the Run of Show](use-the-run-of-show.md)
- [Spreadsheet Import Problems](../troubleshooting/spreadsheet-import-problems.md)
- [Use the Directory](../people-and-program/use-the-directory.md)

## Screenshots

<!-- SCREENSHOT NEEDED
Route: /events/{eventId}/registration/agenda
State: Registration Agenda showing source-path controls, staged entries, validation state, and publication actions.
Purpose: Explain the boundary between official ShowOps sessions, Registration staging, and unavailable external synchronization.
Annotation targets:
1. Import official ShowOps sessions action
2. Spreadsheet, manual, and PDF reference paths
3. Draft, published, and archived entry actions
-->
