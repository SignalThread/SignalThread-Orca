# Editing a Survey

Use this guide to update an existing survey.

## Where To Go

From the dashboard:

1. Find the survey inside its Location/Team card
2. Click the edit action

## What You Can Edit

Depending on survey status, you can change:

- survey name
- description
- questions
- question voice settings
- survey status

## Survey Status Rules

The app currently uses these status rules.

### Draft

You can edit:

- name
- description
- questions
- question voice settings

You can also activate the survey.

### Active

You can edit:

- survey name
- question voice settings

You cannot edit:

- the question list

What this means:

- Active surveys keep their question structure stable while they are live.
- Voice settings can still be updated and saved.

### Completed

Question content is treated as read-only.

Question voice settings are still available in the UI and can still be updated.

This area is somewhat unusual from a product perspective, but it is how the current code behaves.

## Save Changes

When you click `Save Changes`, the app checks whether anything audio-related changed.

Question audio regenerates only when needed, including:

- voice changed
- locale changed internally from voice choice
- question text changed
- a new question was added

Question audio does not regenerate for unrelated edits like a name-only change.

## Kiosk Link on Active Surveys

When a survey is active, the edit page shows a kiosk link with a `Copy` button.

What this means:

- You can quickly open or share the live kiosk flow for that survey.

## Delete Survey

Draft surveys can be deleted from the edit page.

The UI warns that deletion permanently removes:

- responses
- answers
- related data

Treat delete as permanent.

## Tips Before Saving

Before you save:

- preview the question voice
- confirm questions sound natural out loud
- check the survey name still matches the use case

See also:

- [Choosing Question Voice](/Users/ali/Documents/Booth Audio/docs/help/question-voice.md)
- [Running a Kiosk Survey](/Users/ali/Documents/Booth Audio/docs/help/running-a-kiosk.md)
