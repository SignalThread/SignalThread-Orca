---
title: Reviewing Responses and Insights
description: How to read survey analytics, top themes, pulse, and action-oriented insights.
sidebar:
  order: 6
---


This guide explains how to review survey performance after responses start coming in.

## Where To Review Results

From the dashboard:

1. Find the survey inside its Location/Team card
2. Open the analytics view for that survey

## What You’ll See

The survey analytics screens currently include:

- response counts
- completion counts
- response trend
- overall summary
- overall pulse
- top themes
- opportunities or recommended actions

The dashboard also supports drilldown behavior for insights.

## Overall Pulse

`Overall Pulse` is the top-level quality signal for the survey.

In code, it is presented as a score plus a label such as:

- Great
- Good
- Mixed
- Needs Attention

What this means:

- It is a fast read on overall sentiment and trend.
- It is not just a raw count of responses.

## Response Trend

The app shows a visual timeline of response activity over time.

Use this to answer:

- Are responses increasing?
- Did participation drop after launch?
- Did a campaign or staffing change affect volume?

## Top Themes

The analytics view includes a `Top Themes` area.

What this means:

- The app groups common topics across voice responses
- You can quickly see what people talk about most often

## Recommended Actions / Opportunities

The insights system also surfaces action-oriented recommendations.

What this means:

- the app is not only summarizing sentiment
- it is also trying to point to practical follow-up actions

## Reviewing Raw Responses

The current code clearly supports drilldown and transcript-oriented review flows inside analytics.

Transcript and raw-response review exist in the product, but the exact final customer-facing labels and export paths are not fully clear from this audit. Marked as:

- `needs product review`

## Exports

The in-app Help page references export support for analytics and downstream reporting.

However, exact export controls were not fully confirmed in this code audit. Marked as:

- `needs product review`

## How To Read This As an SMB Team

If you are not a data-heavy team, start with this order:

1. overall pulse
2. completed response count
3. top themes
4. recommended actions

This gives you the fastest view of what customers or visitors are saying and what to fix first.

See also:

- [Running a Kiosk Survey](/help/surveys/running-a-kiosk/)
- [Troubleshooting](/help/support/troubleshooting/)
