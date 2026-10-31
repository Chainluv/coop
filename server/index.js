const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { db, tx, DATA_DIR } = require('./db');
const core = require('./core');
const { seedDemo } = require('./seed');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

if (process.env.COOP_SEED !== '0') seedDemo();

// ---------- helpers ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const wrap = (fn) => (req, res, next) => { try { const out = fn(req, res); if (out !== undefined) res.json(out); } catch (e) { next(e); } };
const str = (v, max, field) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length > max) fail(400, `${field} must be ${max} characters or fewer.`);
  return s;
};
const isUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; } };

// ---------- auth ----------
const SESSION_DAYS = 30;
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};
const checkPassword = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(got, Buffer.from(hash, 'hex'));
};
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((p) => p[0]));

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_DAYS * 864e5);
  res.cookie('coop_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_DAYS * 864e5, path: '/' });
}

app.use((req, _res, next) => {
  const token = cookies(req).coop_session;
  if (token) {
    const row = db.prepare('SELECT s.user_id, s.expires_at, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token);
    if (row && row.expires_at > Date.now()) {
      req.user = { id: row.user_id, email: row.email, token };
      req.me = db.prepare('SELECT * FROM artists WHERE user_id = ?').get(row.user_id) || null;
    }
  }
  next();
});
const auth = (req, _res, next) => (req.user && req.me ? next() : next(new HttpError(401, 'Please log in first.')));

// Cross-site form posts can't carry JSON or our custom header; require one of them on writes.
app.use('/api', (req, _res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const ct = req.headers['content-type'] || '';
    if (!ct.startsWith('application/json') && req.headers['x-coop'] !== '1') return next(new HttpError(403, 'Bad request origin.'));
  }
  next();
});

function validateProfile(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) { out.name = str(body.name, 40, 'Name'); if (!out.name) fail(400, 'Artist name is required.'); }
  if (!partial || body.city !== undefined) { out.city = str(body.city, 60, 'City'); if (!out.city) fail(400, 'City is required.'); }
  if (!partial || body.region !== undefined) { if (!['East', 'West'].includes(body.region)) fail(400, 'Pick East or West.'); out.region = body.region; }
  if (body.bio !== undefined) out.bio = str(body.bio, 400, 'Bio');
  if (body.seeking !== undefined) out.seeking = str(body.seeking, 200, 'Looking-for note');
  if (body.genres !== undefined) {
    if (!Array.isArray(body.genres)) fail(400, 'Genres must be a list.');
    out.genres = JSON.stringify([...new Set(body.genres.filter((g) => core.GENRES.includes(g)))].slice(0, 5));
  }
  if (body.roles !== undefined) {
    if (!Array.isArray(body.roles)) fail(400, 'Roles must be a list.');
    out.roles = JSON.stringify([...new Set(body.roles.filter((r) => core.ROLES.includes(r)))]);
  }
  if (body.links !== undefined) {
    if (!Array.isArray(body.links) || body.links.length > 6) fail(400, 'Up to 6 links.');
    out.links = JSON.stringify(body.links.map((l) => {
      const label = str(l.label, 30, 'Link label') || 'Link';
      const url = str(l.url, 300, 'Link URL');
      if (!isUrl(url)) fail(400, `"${url || label}" isn't a valid http(s) link.`);
      return { label, url };
    }));
  }
  if (body.open_to_collab !== undefined) out.open_to_collab = body.open_to_collab ? 1 : 0;
  return out;
}

app.post('/api/auth/signup', wrap((req, res) => {
  const email = str(req.body.email, 120, 'Email').toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email.');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters.');
  const profile = validateProfile(req.body);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'An account with that email already exists.');
  const userId = tx(() => {
    const u = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, hashPassword(password), core.now());
    const uid = Number(u.lastInsertRowid);
    db.prepare(`INSERT INTO artists (user_id, name, city, region, bio, genres, roles, open_to_collab, avatar_style, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(uid, profile.name, profile.city, profile.region, profile.bio || '', profile.genres || '[]', profile.roles || '[]', crypto.randomInt(6), core.now());
    return uid;
  });
  startSession(res, userId);
  res.status(201);
  return { ok: true };
}));

app.post('/api/auth/login', wrap((req, res) => {
  const email = str(req.body.email, 120, 'Email').toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !checkPassword(String(req.body.password || ''), user.password_hash)) fail(401, 'Email or password is incorrect.');
  startSession(res, user.id);
  return { ok: true };
}));

app.post('/api/auth/logout', wrap((req, res) => {
  if (req.user) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.user.token);
  res.clearCookie('coop_session', { path: '/' });
  return { ok: true };
}));

function inboxCount(artistId) {
  return db.prepare(`SELECT (SELECT COUNT(*) FROM tracks WHERE partner_id = ? AND status = 'pending') + (SELECT COUNT(*) FROM requests WHERE to_id = ? AND status = 'pending') AS n`).get(artistId, artistId).n;
}

app.get('/api/me', wrap((req) => {
  if (!req.user || !req.me) return { user: null };
  return { user: { id: req.user.id, email: req.user.email }, artist: core.getArtist(req.me.id), inbox: inboxCount(req.me.id) };
}));

app.get('/api/meta', wrap(() => ({ genres: core.GENRES, roles: core.ROLES })));

// ---------- uploads ----------
const UPLOADS = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const AUDIO_EXT = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/ogg': '.ogg', 'audio/flac': '.flac', 'audio/x-flac': '.flac', 'audio/webm': '.webm' };
const IMAGE_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + (AUDIO_EXT[file.mimetype] || IMAGE_EXT[file.mimetype])),
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ok = (file.fieldname === 'audio' && AUDIO_EXT[file.mimetype]) || ((file.fieldname === 'artwork' || file.fieldname === 'photo') && IMAGE_EXT[file.mimetype]);
    cb(ok ? null : new HttpError(400, file.fieldname === 'audio' ? 'Audio must be MP3, WAV, M4A, AAC, OGG or FLAC.' : 'Images must be JPG, PNG, WEBP or GIF.'), !!ok);
  },
});
const removeUpload = (url) => { if (url && url.startsWith('/uploads/')) fs.rm(path.join(UPLOADS, path.basename(url)), { force: true }, () => {}); };
const cleanupFiles = (req) => { for (const list of Object.values(req.files || {})) for (const f of list) fs.rm(f.path, { force: true }, () => {}); if (req.file) fs.rm(req.file.path, { force: true }, () => {}); };

app.use('/uploads', express.static(UPLOADS, { maxAge: '7d', fallthrough: false }));

// ---------- profiles ----------
app.put('/api/me/artist', auth, wrap((req) => {
  const fields = validateProfile(req.body, { partial: true });
  if (fields.seeking !== undefined && fields.seeking !== req.me.seeking) fields.seeking_at = fields.seeking ? core.now() : null;
  const keys = Object.keys(fields);
  if (keys.length) db.prepare(`UPDATE artists SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), req.me.id);
  return { artist: core.getArtist(req.me.id) };
}));

app.post('/api/me/photo', auth, upload.single('photo'), wrap((req) => {
  if (!req.file) fail(400, 'Choose an image to upload.');
  if (req.file.size > 5 * 1024 * 1024) { cleanupFiles(req); fail(400, 'Profile photos must be under 5 MB.'); }
  removeUpload(req.me.photo_url);
  db.prepare('UPDATE artists SET photo_url = ? WHERE id = ?').run(`/uploads/${req.file.filename}`, req.me.id);
  return { artist: core.getArtist(req.me.id) };
}));

app.delete('/api/me/photo', auth, wrap((req) => {
  removeUpload(req.me.photo_url);
  db.prepare('UPDATE artists SET photo_url = NULL WHERE id = ?').run(req.me.id);
  return { artist: core.getArtist(req.me.id) };
}));

app.get('/api/artists', wrap((req) => ({ artists: core.searchArtists(req.query) })));

app.get('/api/artists/:id', wrap((req) => {
  const d = core.artistDetail(Number(req.params.id));
  if (!d) fail(404, 'Artist not found.');
  if (req.me && req.me.id !== d.artist.id) {
    const lo = Math.min(req.me.id, d.artist.id), hi = Math.max(req.me.id, d.artist.id);
    d.relationship = {
      openRequest: db.prepare(`SELECT id, from_id, status FROM requests WHERE pair_lo = ? AND pair_hi = ? AND status = 'pending'`).get(lo, hi) || null,
      pendingTracks: db.prepare(`SELECT COUNT(*) AS n FROM tracks WHERE pair_lo = ? AND pair_hi = ? AND status = 'pending'`).get(lo, hi).n,
      collaborated: d.collaborators.some((c) => c.id === req.me.id),
    };
  }
  return d;
}));

// ---------- arena / leaderboard / feed ----------
app.get('/api/arena', wrap(() => ({
  ...core.leaders(),
  leaderboard: { West: core.rankRegion('West', { limit: 5 }), East: core.rankRegion('East', { limit: 5 }) },
  feed: core.feed(10),
})));
app.get('/api/leaderboard', wrap(() => ({ West: core.rankRegion('West'), East: core.rankRegion('East') })));
app.get('/api/feed', wrap((req) => ({ feed: core.feed(Math.min(50, Number(req.query.limit) || 30)) })));

// ---------- collaborations (tracks) ----------
app.post('/api/tracks', auth, upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'artwork', maxCount: 1 }]), (req, res, next) => {
  try {
    const partnerId = Number(req.body.partner_id);
    const title = str(req.body.title, 80, 'Track title');
    const link = str(req.body.link_url, 300, 'Music link');
    const note = str(req.body.note, 280, 'Note');
    if (!title) fail(400, 'Give the track a title.');
    if (!core.titleKey(title)) fail(400, 'Track title needs at least one letter or number.');
    if (partnerId === req.me.id) fail(400, "You can't log a collaboration with yourself.");
    const partner = core.artistRow(partnerId);
    if (!partner) fail(404, 'Pick an artist to collaborate with.');
    if (partner.is_demo) fail(400, "Demo artists can't confirm collaborations. Pick a real CO-OP artist.");
    const audio = req.files?.audio?.[0], art = req.files?.artwork?.[0];
    if (!link && !audio) fail(400, 'Add a music link or upload an audio file.');
    if (link && !isUrl(link)) fail(400, 'Music link must start with http:// or https://');
    if (art && art.size > 5 * 1024 * 1024) fail(400, 'Artwork must be under 5 MB.');
    const lo = Math.min(req.me.id, partnerId), hi = Math.max(req.me.id, partnerId);
    const dupe = db.prepare(`SELECT status FROM tracks WHERE pair_lo = ? AND pair_hi = ? AND title_key = ? AND status <> 'declined'`).get(lo, hi, core.titleKey(title));
    if (dupe) fail(409, dupe.status === 'pending' ? 'That track is already waiting for confirmation.' : 'You two have already logged a track with that title.');
    const r = db.prepare(`INSERT INTO tracks (title, title_key, submitter_id, partner_id, pair_lo, pair_hi, link_url, audio_url, artwork_url, note, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(title, core.titleKey(title), req.me.id, partnerId, lo, hi, link || null,
      audio ? `/uploads/${audio.filename}` : null, art ? `/uploads/${art.filename}` : null, note, core.now());
    res.status(201).json({ track: core.getTrack(Number(r.lastInsertRowid)) });
  } catch (e) { cleanupFiles(req); next(e); }
});

function respondTrack(req, status) {
  const t = db.prepare('SELECT * FROM tracks WHERE id = ?').get(Number(req.params.id));
  if (!t) fail(404, 'Track not found.');
  if (t.partner_id !== req.me.id) fail(403, 'Only the tagged artist can respond to this.');
  if (t.status !== 'pending') fail(409, `This track was already ${t.status}.`);
  db.prepare('UPDATE tracks SET status = ?, responded_at = ? WHERE id = ?').run(status, core.now(), t.id);
  return { track: core.getTrack(t.id) };
}
app.post('/api/tracks/:id/confirm', auth, wrap((req) => respondTrack(req, 'confirmed')));
app.post('/api/tracks/:id/decline', auth, wrap((req) => respondTrack(req, 'declined')));
app.post('/api/tracks/:id/cancel', auth, wrap((req) => {
  const t = db.prepare('SELECT * FROM tracks WHERE id = ?').get(Number(req.params.id));
  if (!t || t.submitter_id !== req.me.id) fail(404, 'Track not found.');
  if (t.status !== 'pending') fail(409, 'Only pending submissions can be withdrawn.');
  db.prepare('DELETE FROM tracks WHERE id = ?').run(t.id);
  removeUpload(t.audio_url); removeUpload(t.artwork_url);
  return { ok: true };
}));

// ---------- collaboration requests ----------
app.post('/api/requests', auth, wrap((req, res) => {
  const toId = Number(req.body.to_id);
  const message = str(req.body.message, 500, 'Message');
  if (toId === req.me.id) fail(400, "You can't send a request to yourself.");
  const to = core.artistRow(toId);
  if (!to) fail(404, 'Artist not found.');
  if (to.is_demo) fail(400, "Demo artists can't receive requests.");
  if (!to.open_to_collab) fail(400, `${to.name} isn't open to collaborations right now.`);
  if (!message) fail(400, 'Add a short message so they know what you have in mind.');
  const lo = Math.min(req.me.id, toId), hi = Math.max(req.me.id, toId);
  if (db.prepare(`SELECT 1 FROM requests WHERE pair_lo = ? AND pair_hi = ? AND status = 'pending'`).get(lo, hi)) fail(409, 'There is already an open request between you two.');
  const r = db.prepare('INSERT INTO requests (from_id, to_id, pair_lo, pair_hi, message, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.me.id, toId, lo, hi, message, core.now());
  res.status(201);
  return { id: Number(r.lastInsertRowid) };
}));

function respondRequest(req, status) {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(Number(req.params.id));
  if (!r || r.to_id !== req.me.id) fail(404, 'Request not found.');
  if (r.status !== 'pending') fail(409, `This request was already ${r.status}.`);
  db.prepare('UPDATE requests SET status = ?, responded_at = ? WHERE id = ?').run(status, core.now(), r.id);
  return { ok: true };
}
app.post('/api/requests/:id/accept', auth, wrap((req) => respondRequest(req, 'accepted')));
app.post('/api/requests/:id/decline', auth, wrap((req) => respondRequest(req, 'declined')));

app.get('/api/inbox', auth, wrap((req) => {
  const me = req.me.id;
  const tracks = (where, ...a) => db.prepare(`${core.TRACK_SELECT} WHERE ${where} ORDER BY t.created_at DESC LIMIT 50`).all(...a).map(core.shapeTrack);
  const reqs = (where, ...a) => db.prepare(`SELECT * FROM requests WHERE ${where} ORDER BY created_at DESC LIMIT 50`).all(...a).map((r) => ({
    id: r.id, message: r.message, status: r.status, created_at: r.created_at, responded_at: r.responded_at,
    from: core.miniArtist(core.artistRow(r.from_id)), to: core.miniArtist(core.artistRow(r.to_id)),
  }));
  return {
    incomingTracks: tracks(`t.partner_id = ? AND t.status = 'pending'`, me),
    outgoingTracks: tracks(`t.submitter_id = ? AND t.status = 'pending'`, me),
    incomingRequests: reqs(`to_id = ? AND status = 'pending'`, me),
    outgoingRequests: reqs(`from_id = ? AND status = 'pending'`, me),
    history: [
      ...reqs(`(to_id = ? OR from_id = ?) AND status <> 'pending'`, me, me).map((r) => ({ kind: 'request', at: r.responded_at, ...r })),
      ...tracks(`(t.partner_id = ? OR t.submitter_id = ?) AND t.status <> 'pending'`, me, me).map((t) => ({ kind: 'track', at: t.responded_at, ...t })),
    ].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 30),
  };
}));

// ---------- generated art ----------
const svg = (res, body) => { res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(body); };
app.get('/api/avatar/:id.svg', (req, res) => {
  const a = core.artistRow(Number(req.params.id));
  if (!a) return res.status(404).end();
  svg(res, core.avatarSvg(a));
});
app.get('/api/cover/:id.svg', (req, res) => {
  const t = db.prepare(`SELECT t.id, t.title, s.name AS s_name, s.region AS s_region, p.name AS p_name, p.region AS p_region FROM tracks t JOIN artists s ON s.id = t.submitter_id JOIN artists p ON p.id = t.partner_id WHERE t.id = ?`).get(Number(req.params.id));
  if (!t) return res.status(404).end();
  svg(res, core.coverSvg(t));
});

// ---------- static SPA ----------
const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC, { maxAge: '1h' }));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));
app.get(/.*/, (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Files must be under 20 MB.' : err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (String(err.message).includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'That already exists.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

// Clear expired sessions once a day.
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 864e5).unref();

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`CO-OP running at http://localhost:${port}`));
}

module.exports = app;
