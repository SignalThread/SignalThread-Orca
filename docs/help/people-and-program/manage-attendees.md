---
title: "Manage Attendees"
description: "Track event participation, registration state, source, roles, and review issues for attendees."
category: "People and Program"
subcategory: ""
slug: "manage-attendees"
order: 320
status: "published"
audience:
  - "planner"
difficulty: "beginner"
estimatedReadTime: 6
lastReviewed: "2026-07-13"
tags:
  - "attendees"
  - "registration"
  - "directory"
related:
  - "understand-attendee-and-directory-records"
  - "missing-or-duplicate-people"
sourceRoutes:
  - "/events/{eventId}/attendees"
screenshotStatus: "captured"
---

# Manage Attendees

Track event participation, registration state, source, roles, and review issues for attendees.

## Overview

Attendee records use the canonical Directory person underneath.

Session registration is Coming soon in production even though agenda data structures exist.

## When You’ll Use It

- Open this guide when you need to track event participation, registration state, source, roles, and review issues for attendees.
- Return before program publishing, external communication, and onsite handoff when people or readiness data changes.

## Before You Begin

- Open the correct event and search Event Directory before creating a new person.
- Editing requires event editor access; external speaker links do not grant planner access.

## Open Attendees

1. Expand **Event Directory** and select **Attendees**.
2. Use **Add attendee**, **Import CSV**, search, **All roles**, and **All sources**.

## Add or Import Attendees

1. Open Directory, then Attendees.
2. Choose Add attendee for one person or Import CSV for a list.
3. For an import, provide a source label, map columns, and review the preview.
4. Review import counts and inspect Needs review or Sync conflicts afterward.

## Review Attendee Health

1. Use the summary cards for Total attendees, Registered, Pending / waitlisted, Cancelled, VIP / Press, Missing email, Needs review, and Sync conflicts.
2. Search and filter by registration, role, or source.
3. Open an attendee drawer to review or update supported details.

## Understand Important Concepts

- Attendee records use the canonical Directory person underneath.
- Session registration is Coming soon in production even though agenda data structures exist.

## In-product Helper Text

> Attendee status describes event participation; Directory roles describe who the person is in the event.

## Planner Tips

- Resolve Missing email before creating an email audience. Separate Pending / waitlisted from confirmed counts in venue guarantees.

## Best Practices

- Separate **Pending / waitlisted** from **Registered** when preparing guarantees.
- Resolve **Missing email**, **Needs review**, and **Sync conflicts** before downstream communication.

## Troubleshooting

### A control is missing or disabled

Check the canonical Directory person, your event role, and any review or token state described in this article.

## Frequently Asked Questions

### Where is the system of record?

Event Directory owns identity and roles. Attendees owns participation, registration, review, and sync state for people with the attendee role.

## Related Articles

- [Understand Attendee and Directory Records](understand-attendee-and-directory-records.md)
- [Missing or Duplicate People](../troubleshooting/missing-or-duplicate-people.md)

## Screenshots

![Attendees view with registered, pending or waitlisted, and sync conflict states represented.](/help/screenshots/hc-37-manage-attendees.png)
