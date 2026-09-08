# Voice Note Status Labels

Status labels show where each voice note is in the journey from recording to transcript. They help you understand whether a note is waiting on connection, processing, or ready to support AI Insights.

---

## Status Labels

### Uploading...
The audio is being sent for processing. A stable connection helps this finish faster.

### Processing transcript...
The audio is being converted into text. Longer recordings can take more time.

### Transcript ready
The transcript is available. AI Insights may still be updating.

### Uploading when connection improves...
The device is offline or connection is too weak. The audio is saved locally and uploads automatically when connection returns.

See [Voice Notes Offline](voice-notes-offline.md).

### Processing failed
The transcript could not be created. Add a short context note with the key points, or contact support if failures continue.

---

## Processing Flow

```
Recorded -> Uploading... -> Processing transcript... -> Transcript ready
```

If recorded offline:

```
Recorded -> Uploading when connection improves... -> Uploading... -> Processing transcript... -> Transcript ready
```

---

## Where Labels Appear

Open a lead, then tap **View all notes** from the Context & Notes card. Each note shows its current status in the Voice Notes sheet.

The Context & Notes card also summarizes the lead's overall processing status.

---

## Related Articles

- [Add a Context Voice Note](add-context-voice-note.md)
- [Voice Notes Offline](voice-notes-offline.md)
- [Voice Note Transcript](voice-note-transcript.md)
- [AI Insights Not Ready](../recording-and-ai/ai-insights-not-ready.md)
