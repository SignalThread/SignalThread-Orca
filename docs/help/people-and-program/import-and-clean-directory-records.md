---
title: "Import and Clean Directory Records"
description: "Import event people, review conflicts, and correct duplicate-review records in Event Directory."
category: "People and Program"
subcategory: ""
slug: "import-and-clean-directory-records"
order: 310
status: "published"
audience:
  - "planner"
difficulty: "intermediate"
estimatedReadTime: 6
lastReviewed: "2026-07-13"
tags:
  - "directory"
  - "import"
  - "duplicates"
related:
  - "missing-or-duplicate-people"
  - "use-the-directory"
sourceRoutes:
  - "/events/{eventId}/directory"
screenshotStatus: "needed"
---

# Import and Clean Directory Records

Import event people, review conflicts, and correct duplicate-review records in Event Directory.

## Overview

Email is a strong identity field, but imports may still require planner review.

A conflict is not the same as a skipped row; it indicates data that could not be applied cleanly.

## When You’ll Use It

- Open this guide when you need to import event people, review conflicts, and correct duplicate-review records in Event Directory.
- Return before program publishing, external communication, and onsite handoff when people or readiness data changes.

## Before You Begin

- Open the correct event and search Event Directory before creating a new person.
- Editing requires event editor access; external speaker links do not grant planner access.

## Open Import and Clean Directory Records

1. Open **Event Directory** and select **Import people**.
2. Choose a file, add a source label, map columns, and review the preview before importing.

## Import People

1. Open Directory and choose Import people.
2. Select a supported spreadsheet or CSV and enter a source label.
3. Map identity and role fields.
4. Review the preview, including rows missing identity information.
5. Run the import and review created, updated, conflict, invalid, and skipped counts.

## Resolve Duplicates

1. Search by name and email with **All roles** and **All statuses** selected.
2. Open each candidate and compare identity, roles, and source labels.
3. Edit the incorrect record or remove the inappropriate role using available controls.
4. The current planner UI does not expose the underlying merge operation. Do not claim two records were merged unless a supported administrative process completed it.

## Understand Important Concepts

- Email is a strong identity field, but imports may still require planner review.
- A conflict is not the same as a skipped row; it indicates data that could not be applied cleanly.

## In-product Helper Text

> Preview rows missing identity before importing them.

## Planner Tips

- Add a source label such as 'Registration export 2026-07-10' so later cleanup can distinguish imports.

## Best Practices

- Use a dated source label so planners can trace imported roles later.
- The current UI flags duplicate-review records but does not expose a planner merge control; correct records individually.

## Troubleshooting

### A control is missing or disabled

Check the canonical Directory person, your event role, and any review or token state described in this article.

## Frequently Asked Questions

### Where is the system of record?

After import, Event Directory owns the created identities, roles, and source labels. The import review remains evidence for reconciling skipped, invalid, or duplicate-review rows.

## Related Articles

- [Missing or Duplicate People](../troubleshooting/missing-or-duplicate-people.md)
- [Use the Directory](use-the-directory.md)

## Screenshots

<!-- SCREENSHOT NEEDED
Route: /events/{eventId}/directory
State: Import people modal with source label, mapping, and a row missing identity.
Purpose: HC-36 teaches the workflow state shared by import-and-clean-directory-records, missing-or-duplicate-people.
Annotation targets:
1. Import people
2. Source label
3. Preview
-->
