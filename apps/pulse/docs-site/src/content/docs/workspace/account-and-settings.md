---
title: Account and Settings Basics
description: Overview of profile settings, consent, branding, billing, and team management.
sidebar:
  order: 2
---


This guide covers the main settings areas available from the app.

## Where To Go

1. Open `Profile Settings`

The page currently includes these tabs:

- `Locations/Teams`
- `Consent Screen`
- `Branding`
- `Billing`
- `Users`

## Consent Screen

Use this tab to control the language shown before recording begins.

Current editable fields in code include:

- title
- subtitle
- consent bullet items
- consent button text

There is also a live phone-style preview on the right side.

What this means:

- You can make the pre-recording experience sound more like your brand or venue.

## Branding

Use this tab to control the survey’s visual identity.

Current settings include:

- uploaded logo
- primary color
- primary button color

The tab includes:

- a visible uploaded-logo state
- live preview behavior tied to the current form state

What this means:

- You can see branding changes before saving
- The upload area gives clearer confirmation when a logo is already set

## Billing

The app has a billing tab backed by Stripe billing and customer portal flows.

Confirmed from code:

- plan tier is shown
- trial/subscription status data is returned
- there is a portal session flow for managing billing

Exact customer-facing billing copy beyond that:

- `needs product review`

## Users

The settings page includes a `Users` tab powered by an account users panel.

The presence of team-user management is confirmed in code. Specific end-user workflows in that panel were not fully audited here, so detailed how-to steps are marked:

- `needs product review`

## Back Navigation

The settings page includes a `Back` link to return to the app dashboard.

## When To Use Settings vs Survey Edit

Use `Profile Settings` for:

- locations/teams
- branding
- consent
- billing
- users

Use `Edit Survey` for:

- survey questions
- survey status
- question voice

See also:

- [Locations/Teams](/help/workspace/locations-and-teams/)
- [Choosing Question Voice](/help/surveys/question-voice/)
