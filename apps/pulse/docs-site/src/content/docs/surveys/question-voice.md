---
title: Choosing Question Voice
description: How question voice works, how to preview it, and when saved audio updates automatically.
sidebar:
  order: 3
---


Question voice controls how the survey reads questions aloud during the kiosk experience.

## Where You Set It

Question voice is part of the survey form in both:

- `Create Survey`
- `Edit Survey`

It appears inside the `Questions` section as a compact subsection titled `Question Voice`.

## What You Can Control

The current UI shows:

- `Gender`
- `Voice`
- `Preview Voice`

The provider is internal-only and currently stays on Google. Locale is also internal-only and is derived automatically from the selected voice.

## Current Voice Strategy

The app uses a curated list of friendly, business-oriented voices. Labels are written for non-technical users.

Current examples in code include:

- `Friendly & Welcoming`
- `Warm & Conversational`
- `Polished Narrator`
- `British Friendly`
- `Australian Friendly`
- `Calm & Reassuring`
- `Confident Professional`

What this means:

- You do not need to know Google voice IDs.
- The app stores the technical voice ID behind the scenes.

## Preview a Voice

1. Choose a gender
2. Choose a voice
3. Click `Preview Voice`

The preview uses a short sample line:

`Hi, thanks for sharing your feedback. Let's get started.`

Important:

- Preview audio is temporary
- It is not saved as a permanent asset
- It does not require the survey to be saved first on the create page

## What Happens When You Save

When you save the survey:

1. The selected voice ID is saved to the survey
2. Locale is derived from the selected voice and saved internally
3. Cached question audio is generated or regenerated when needed

## When Audio Regenerates

Audio updates automatically when you save changes that affect spoken output, such as:

- choosing a different voice
- changing question text
- adding a question

## If the Voice Does Not Sound Updated

Check these first:

1. Save the survey after changing the voice
2. Reopen the kiosk flow
3. Confirm you are testing the same survey you edited
4. Preview the voice again in the survey editor

If the preview sounds correct but the kiosk still sounds old, use the troubleshooting guide.

See also:

- [Editing a Survey](/help/surveys/editing-a-survey/)
- [Troubleshooting](/help/support/troubleshooting/)
