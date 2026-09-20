# Archived screens

These pages are not on the live router. Restore one by moving it back to
`src/app/components/` and adding its route in `App.tsx`.

## `record-loop/`

The previous create flow, reached when hold-to-record still A/B'd through
`RecordingStartRoute` / `TranscriptRoute`:

```
/record/click
/record/start      RecordingStartPage (dark blob field)
/record/process
/record/transcript TranscriptPage (gray polish + highlight)
/record/build
/record/shape
/record/shape/grow → weight → color → texture
/record/connect
/record/orb
```

The present flow is:

```
hold (pond / carousel)
 └ /record/start      PuddleRecordingPage
   └ /record/transcript  PuddleTranscriptPage
     └ /record/name      naming rim (LandingPage)
       └ /memory
```
