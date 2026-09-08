# Offline Mode

Event connectivity is rarely perfect. SignalThread Scan is built to keep capture moving when Wi-Fi is crowded or unavailable, then sync your work when the connection comes back.

---

## What Works Offline

| Feature | Offline support |
|---------|-----------------|
| Scan a badge | Yes, for barcode and QR capture |
| Manual lead entry | Yes |
| Scan a business card | Lead details can be captured; text extraction may need connection |
| Browse leads | Yes, with last synced data |
| Open Lead Detail | Yes |
| Record a voice note | Yes |
| View existing transcripts | Yes, when already processed |
| Generate AI Insights | No, upload and processing require connection |
| Sync new leads | No, queued until reconnection |

---

## How Offline Capture Works

New leads are saved on your device immediately. When a stable connection returns, the app syncs them automatically.

Until sync completes, some server-backed features such as AI Briefs or updated AI Insights may not be available.

---

## How Offline Voice Notes Work

Voice notes recorded offline are stored locally and uploaded in the background after reconnecting. Status moves from **Uploading when connection improves...** to **Uploading...**, then **Processing transcript...**, then **Transcript ready**.

See [Voice Notes Offline](../voice-notes/voice-notes-offline.md).

---

## The Offline Banner

When the app detects no connection, Settings shows:

> **Offline mode** - Showing last saved event and profile

This means account and event details may be slightly out of date. Your new leads and notes are still being saved locally.

---

## Reconnect and Sync

Once connection returns:

- New leads sync in the background
- Queued voice notes begin uploading
- Pull down on the Leads list to refresh visible data

---

## Event-Floor Tips

- Keep capturing; the sync queue is designed for real event conditions.
- Switch to cellular if venue Wi-Fi is overloaded.
- Leave the app installed and signed in so queued work can upload when connection improves.

---

## Related Articles

- [Voice Notes Offline](../voice-notes/voice-notes-offline.md)
- [Scan a Badge](../capturing-leads/scan-a-badge.md)
- [Voice Note Status Labels](../voice-notes/voice-note-status-labels.md)
