---
title: "Import and Export Budget Data"
description: "Bring budget lines into Orca and export line-level or summary CSV data for review."
category: "Event Planning"
subcategory: ""
slug: "import-and-export-budget-data"
order: 190
status: "published"
audience:
  - "planner"
difficulty: "intermediate"
estimatedReadTime: 6
lastReviewed: "2026-07-13"
tags:
  - "budget"
  - "import"
  - "export"
related:
  - "manage-the-full-budget-grid"
  - "spreadsheet-import-problems"
sourceRoutes:
  - "/events/{eventId}/budget"
screenshotStatus: "needed"
---

# Import and Export Budget Data

Bring budget lines into Orca and export line-level or summary CSV data for review.

## Overview

The event builder can also import Budget data while creating an event. The Budget import action is for an existing event.

## When You’ll Use It

- Open this guide when you need to bring budget lines into Orca and export line-level or summary CSV data for review.
- Return during early planning, weekly review, client review, final preparation, and closeout whenever this record changes.

## Before You Begin

- Open the correct event and confirm its name and dates.
- Editing requires event editor access; Viewers can inspect supported pages but cannot save protected changes.

## Open Import and Export Budget Data

1. Open **Budget**, select **Full Budget Grid**, then open **Tools**.
2. Choose **Template**, **Import Budget Data**, **Export Line Items (full)**, **Export Filtered View**, or **Export Summary**.

## Import Budget Data

1. Open Budget and choose the budget import action.
2. Download the available template when you need the expected structure.
3. Choose the source file and review the import response.
4. Return to the Full Budget Grid and verify created or updated lines.

## Export Budget Data

1. Open the relevant Budget view.
2. Apply filters when you need a focused line-item export.
3. Choose the line-item or summary CSV export.
4. Open the exported file and confirm its event and filter scope before sharing.

## Understand Important Concepts

- The event builder can also import Budget data while creating an event. The Budget import action is for an existing event.

## In-product Helper Text

> Exports reflect the current event; filtered exports may contain only visible scope.

## Planner Tips

- Keep an untouched copy of the client source file and label exported versions with event name and review date.

## Best Practices

- Download **Template** before preparing a recurring import.
- Name external exports with the event and review date; the live grid remains authoritative.

## Troubleshooting

### A control is missing or disabled

Check your event role, the record's current approval or lock state, and whether the documented feature is available in production.

## Frequently Asked Questions

### Where is the system of record?

Budget owns imported line items after creation. Export files are point-in-time copies and do not update the Orca budget when edited elsewhere.

## Related Articles

- [Manage the Full Budget Grid](manage-the-full-budget-grid.md)
- [Spreadsheet Import Problems](../troubleshooting/spreadsheet-import-problems.md)

## Screenshots

<!-- SCREENSHOT NEEDED
Route: /events/{eventId}/budget?view=grid
State: Import Budget Data modal after mapping, with valid and invalid rows visible.
Purpose: HC-21 teaches the workflow state shared by import-and-export-budget-data, spreadsheet-import-problems.
Annotation targets:
1. Import Budget Data
2. Column mapping
3. Invalid rows
-->

<!-- SCREENSHOT NEEDED
Route: /events/{eventId}/budget?view=grid
State: Tools menu open while active filters make Export Filtered View visible.
Purpose: HC-22 teaches the workflow state shared by import-and-export-budget-data.
Annotation targets:
1. Tools
2. Export Filtered View
3. Export Summary
-->
