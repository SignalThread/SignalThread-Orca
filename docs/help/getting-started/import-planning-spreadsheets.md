---
title: "Import Planning Spreadsheets"
description: "Map existing workbook or CSV data into Run of Show, Budget, and Timeline records."
category: "Getting Started"
subcategory: ""
slug: "import-planning-spreadsheets"
order: 60
status: "published"
audience:
  - "planner"
difficulty: "intermediate"
estimatedReadTime: 6
lastReviewed: "2026-07-13"
tags:
  - "import"
  - "spreadsheets"
  - "event-builder"
related:
  - "spreadsheet-import-problems"
  - "build-a-new-event-from-existing-spreadsheets"
sourceRoutes:
  - "/events/new"
screenshotStatus: "needed"
---

# Import Planning Spreadsheets

Map existing workbook or CSV data into Run of Show, Budget, and Timeline records.

## Overview

Preview states include Ready, Needs review, and Skipped. A skipped row is not created.

Run of Show requires usable session timing; Budget and Timeline each have their own required fields.

## When You’ll Use It

- Open this guide when you need to map existing workbook or CSV data into Run of Show, Budget, and Timeline records.
- Use it during event setup and whenever a planner needs to recheck scope or navigation.

## Before You Begin

- You need an Orca account and access to the organization that owns the event.
- Gather the event dates, timezone, and any source material required by the task.

## Open Import Planning Spreadsheets

1. Select **Create Event**, complete **Event details**, and choose **Upload Spreadsheet**.
2. Upload `.xlsx` or `.csv` files, then continue to **Map spreadsheets**.

## Upload and Map Files

1. Choose spreadsheet import in the event builder.
2. Upload one or more readable .xlsx or .csv files.
3. Assign each relevant sheet to Run of Show, Budget, or Timeline.
4. Map required Planner fields to source columns. Leave irrelevant columns set to Do not map.

## Review the Import

1. Open Preview records, Issues, and Mapping.
2. Resolve missing required mappings and inspect skipped-row reasons.
3. Confirm the Will create totals for each module.
4. Continue to Review & create when the preview matches your source.

## Understand Important Concepts

- Preview states include Ready, Needs review, and Skipped. A skipped row is not created.
- Run of Show requires usable session timing; Budget and Timeline each have their own required fields.

## In-product Helper Text

> Required fields must be mapped before Orca can create records.

## Planner Tips

- Import the cleanest worksheet, not a presentation-formatted summary tab. Remove subtotal and decorative rows before upload when possible.

## Best Practices

- Remove subtotal, title, and decorative rows from source sheets before upload.
- Treat skipped-row counts as work to reconcile, not as a successful import total.

## Troubleshooting

### I cannot continue to Review & create

Map every required field and ensure at least one sheet targets Run of Show, Budget, or Timeline.

## Frequently Asked Questions

### Where is the system of record?

The selected organization and event determine scope. Once inside an event, the owning event module is authoritative.

## Related Articles

- [Spreadsheet Import Problems](../troubleshooting/spreadsheet-import-problems.md)
- [Build a New Event from Existing Spreadsheets](../workflows/build-a-new-event-from-existing-spreadsheets.md)

## Screenshots

<!-- SCREENSHOT NEEDED
Route: /events/new
State: Map spreadsheets step with one workbook, a target module, required mappings, and one mapping warning.
Purpose: HC-06 teaches the workflow state shared by import-planning-spreadsheets, build-a-new-event-from-existing-spreadsheets, spreadsheet-import-problems.
Annotation targets:
1. Map spreadsheets
2. Planner field
3. Needs mapping
-->

<!-- SCREENSHOT NEEDED
Route: /events/new
State: Review & create with Preview records and Issues available and nonzero Will create totals.
Purpose: HC-07 teaches the workflow state shared by import-planning-spreadsheets, build-a-new-event-from-existing-spreadsheets.
Annotation targets:
1. Review & create
2. Issues
3. Will create
-->
