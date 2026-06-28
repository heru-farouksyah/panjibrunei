# Archived mini-games (not wired into the campaign)

These are complete, working mini-games that no campaign node currently uses.
They are **not imported** by `main.js`, so Vite does not include them in the
build. Kept here for reference / possible reuse.

- **climb.js** — `showClimb()`: 3D Doodle-Jump-style platform climber. Was the
  "Skirmish at the Tamu" game before that stage was switched to the RTS.
- **tycoon.js** — `showTycoon()`: canvas market-tycoon mini-game. An earlier
  candidate for "Skirmish at the Tamu".

To re-activate one: move it back to `src/render/`, re-add its `import` +
`start…()` dispatch in `src/main.js`, and point a mission's `mode` at it in
`campaignData.js`.

Note: their relative imports (`./toonkit.js`, `./kampongAudio.js`, …) assume the
file sits in `src/render/`; fix the paths (or move the file back) before use.
