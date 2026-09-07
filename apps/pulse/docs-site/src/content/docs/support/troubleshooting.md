---
title: Troubleshooting
description: Common fixes for audio preview, kiosk playback, QR scanning, login, and save issues.
sidebar:
  order: 1
---


This guide covers the most common setup and runtime issues confirmed in the current app code.

## Audio Preview Does Not Play

Try this:

1. Make sure you are signed in
2. Confirm the page URL still includes the `account` parameter
3. Click `Preview Voice` again
4. Check browser audio output and mute settings

What this means:

- Voice preview requires account-scoped authorization
- The preview is generated on the server and played back in the browser

## The Kiosk Uses the Wrong Voice

Try this:

1. Open the survey editor
2. Change the voice again
3. Click `Save Changes`
4. Reopen the kiosk link or QR code

The current save flow is designed to regenerate question audio automatically when voice or question text changes.

If the issue continues:

1. Preview the voice in the editor
2. Confirm you edited the same survey you are launching
3. Test on a fresh kiosk session

## Preview Works but Live Kiosk Sounds Different

This can happen if:

- the wrong survey link is being tested
- saved changes were not applied to the survey you launched
- runtime is using fallback audio because cached audio is missing

What this means:

- The app prefers cached question audio for runtime playback
- If cached audio is missing, a temporary server TTS fallback can be used intentionally

## QR Code Does Not Scan Well

Try this:

1. Use `Download PNG` instead of a screenshot
2. Avoid resizing the QR image manually
3. Keep white space around the code
4. Test on the actual device camera

The current QR export is high resolution and includes padding, so the downloaded PNG should be the best option.

## Clicking the QR Does Something Unexpected

The current app is designed so the QR image itself opens an in-app modal, not the browser’s image handler.

Expected actions are:

- `View QR`
- `Download PNG`
- `Copy Link`

If you see a raw image share/download behavior, you may be testing an older build.

## Survey Will Not Save

Common causes:

- survey name is empty
- no location/team is selected
- no questions were added
- one or more questions are blank

## Location/Team Will Not Save

Common causes:

- missing name
- invalid Google review URL format
- plan limit reached

Current plan limits in code:

- Starter: 1
- Growth: 5
- Enterprise: unlimited

## Kiosk Says “No Questions Available”

The kiosk can show:

`No questions available for this event. Please contact support.`

Try this:

1. reopen the survey editor
2. confirm questions are present
3. save the survey again
4. reopen the kiosk

## Consent or Branding Looks Wrong

Check:

1. `Profile Settings`
2. `Consent Screen`
3. `Branding`

Use the live previews to confirm what respondents should see.

## Login Problems

If you do not receive a code or cannot sign in:

1. confirm the email address is correct
2. check spam or junk folders
3. try again from the login page

Support contact shown in the app:

- `support@signalthread.ai`

## Features That Need Product Review

These areas exist in code but still need product confirmation before writing more detailed customer instructions:

- exact analytics export steps
- full users-tab workflows
- final customer-facing billing flows beyond portal access
