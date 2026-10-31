# CO-OP

A gamified collaboration arena for music artists. Artists rep the **West** or the **East**, log tracks they make together, and climb their region's leaderboard by working with more *unique* artists.

## Run it

Requires Node.js 22.5+ (uses the built-in `node:sqlite`).

```bash
npm install
npm start          # http://localhost:3000
npm test           # API tests (scoring, confirmation, requests, auth)
```

The SQLite database and uploads live in `data/` (created on first run, git-ignored). Demo content is seeded automatically the first time. `npm run reset` wipes `data/` and starts fresh.

Environment variables: `PORT` (default 3000), `COOP_DATA_DIR` (default `./data`), `COOP_SEED=0` to skip demo content, `NODE_ENV=production` to mark the session cookie `Secure` (serve over HTTPS).

## What's in it

- **Arena (home):** West and East leaders, whether they've collaborated (with a playable shared track) or "These leaders haven't linked up yet.", the collab feed, and compact East/West rankings.
- **Discover:** search by name/city/genre, filter by region, genre, role, open-to-collab, and demo content. Send a collab request with a short message.
- **Inbox:** confirm or decline tracks you were tagged on, accept or decline requests, withdraw pending submissions, see your history.
- **Profiles:** photo upload, city, region, bio, roles, genres, music links, open-to-collab toggle, a "looking for" note that appears in the feed, confirmed collaborators, and collab history.
- **Log a collab:** pick a CO-OP artist, add a title plus a link and/or an audio file (and optional cover art). It counts only after the partner confirms.

## Scoring rules

- Score = number of **unique** confirmed collaborators. Ties are broken by track count, then by who joined first.
- More tracks with the same artist raise your track count, not your collaborator count.
- Self-collaborations are rejected (API check and a database `CHECK`).
- The same pair can't log the same title twice (titles are compared ignoring case and punctuation, enforced by a unique index). A declined submission can be resubmitted.
- Collaborators from either region count. You're ranked within your own region.

## Demo content

28 sample artists and 66 sample tracks are flagged `is_demo` and labelled **Demo** throughout the UI. Demo artists can't receive requests or confirm collaborations. Five demo tracks have playable audio: short original instrumentals synthesized by `scripts/gen-audio.js` (needs ffmpeg). Other demo tracks show "No audio preview" rather than a fake player. Demo portraits and cover art are generated SVGs.

## Stack

Express 5, SQLite (`node:sqlite`), multer for uploads, scrypt-hashed passwords, httpOnly cookie sessions. The frontend is a no-build vanilla JS single-page app (`public/`).

## Layout

```
server/index.js   API routes, auth, uploads
server/core.js    stats/ranking/feed queries, generated SVG art
server/db.js      schema
server/seed.js    demo artists and collaborations
public/           index.html, styles.css, app.js, demo audio
test/             API tests
```
