# Running a Kiosk Survey

This guide covers what happens when you launch a survey in kiosk mode.

## How To Open the Kiosk

You can launch a kiosk in a few ways:

- use the kiosk action from a survey row
- copy the kiosk link from an active survey
- open the survey QR code on another device

The kiosk route uses the survey ID in the URL.

## Kiosk Flow Overview

The current kiosk flow works like this:

1. Respondent opens the kiosk
2. Consent screen appears first
3. If consent is accepted, a response session is created
4. Questions play aloud
5. Respondent records each answer
6. The response is completed
7. A thank-you state appears

If a valid Google review link is configured for the location/team, the kiosk may also show a review helper after completion.

## Before You Go Live

Check these before running a live kiosk:

- microphone access works on the device
- the survey is active
- question voice was previewed
- branding and consent text are correct
- the device stays awake during use if needed

## Consent Screen

Consent settings come from account settings and may include:

- title
- subtitle
- bullet list items
- button text

If someone declines consent, the recording flow should not continue.

## Question Playback

Question playback now prefers cached server-generated question audio.

If cached audio is unavailable, the app can fall back to temporary server-generated TTS. This is an intentional fallback, not the preferred path.

What this means:

- the selected survey voice should carry through to the kiosk
- playback should sound more consistent than generic browser speech

## Recording Answers

For each question:

1. The user taps the microphone
2. They record an answer
3. The answer is uploaded
4. The app advances through the survey flow

The kiosk code includes mobile-specific handling for autoplay and audio unlock behavior, especially on iPhone and Android devices.

## If the Kiosk Shows No Questions

The current error message is:

`No questions available for this event. Please contact support.`

If you see this:

1. Confirm the survey actually has saved questions
2. Confirm you opened the correct kiosk link
3. Re-save the survey if you recently edited questions

## Best Practices for Live Use

- test one full response before public launch
- keep the device volume up enough for spoken questions
- use a stable internet connection
- use a device stand if the survey is public-facing

See also:

- [QR Codes: View, Download, and Share](/Users/ali/Documents/Booth Audio/docs/help/qr-codes.md)
- [Troubleshooting](/Users/ali/Documents/Booth Audio/docs/help/troubleshooting.md)
