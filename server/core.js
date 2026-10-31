const { db } = require('./db');

const GENRES = ['Hip Hop', 'R&B', 'Soul', 'Trap', 'Drill', 'Pop', 'Alternative', 'Indie', 'Electronic', 'Lo-fi', 'Jazz', 'Afrobeats', 'Latin', 'Gospel', 'Rock', 'Neo-soul'];
const ROLES = ['Rapper', 'Singer', 'Songwriter', 'Producer', 'Engineer', 'DJ', 'Instrumentalist'];

const now = () => new Date().toISOString();
const titleKey = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '');
const parse = (s, d = []) => { try { return JSON.parse(s); } catch { return d; } };

// Each confirmed track is an edge between two artists. Unique collaborators =
// distinct partners across those edges; track count = number of edges.
const STATS_SQL = `
WITH edges AS (
  SELECT submitter_id AS a, partner_id AS b FROM tracks WHERE status = 'confirmed'
  UNION ALL
  SELECT partner_id AS a, submitter_id AS b FROM tracks WHERE status = 'confirmed'
),
stats AS (
  SELECT a AS id, COUNT(DISTINCT b) AS collaborators, COUNT(*) AS track_count FROM edges GROUP BY a
)
SELECT ar.*, COALESCE(s.collaborators, 0) AS collaborators, COALESCE(s.track_count, 0) AS track_count
FROM artists ar LEFT JOIN stats s ON s.id = ar.id`;

const RANK_ORDER = 'collaborators DESC, track_count DESC, created_at ASC, id ASC';

function photoOf(row) {
  return row.photo_url || `/api/avatar/${row.id}.svg?v=${row.avatar_style || 0}${row.region === 'East' ? 'e' : 'w'}`;
}

function publicArtist(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    region: row.region,
    bio: row.bio,
    genres: parse(row.genres),
    roles: parse(row.roles),
    links: parse(row.links),
    open_to_collab: !!row.open_to_collab,
    seeking: row.seeking,
    seeking_at: row.seeking_at,
    photo: photoOf(row),
    is_demo: !!row.is_demo,
    collaborators: row.collaborators ?? undefined,
    track_count: row.track_count ?? undefined,
    created_at: row.created_at,
  };
}

function miniArtist(row) {
  return { id: row.id, name: row.name, region: row.region, city: row.city, photo: photoOf(row), is_demo: !!row.is_demo };
}

function getArtist(id) {
  const row = db.prepare(`${STATS_SQL} WHERE ar.id = ?`).get(id);
  return row ? publicArtist(row) : null;
}

function artistRow(id) {
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id);
}

const TRACK_SELECT = `
SELECT t.*,
  s.id AS s_id, s.name AS s_name, s.region AS s_region, s.city AS s_city, s.photo_url AS s_photo_url, s.avatar_style AS s_avatar_style, s.is_demo AS s_is_demo,
  p.id AS p_id, p.name AS p_name, p.region AS p_region, p.city AS p_city, p.photo_url AS p_photo_url, p.avatar_style AS p_avatar_style, p.is_demo AS p_is_demo
FROM tracks t JOIN artists s ON s.id = t.submitter_id JOIN artists p ON p.id = t.partner_id`;

function shapeTrack(r) {
  const side = (k) => miniArtist({ id: r[k + '_id'], name: r[k + '_name'], region: r[k + '_region'], city: r[k + '_city'], photo_url: r[k + '_photo_url'], avatar_style: r[k + '_avatar_style'], is_demo: r[k + '_is_demo'] });
  return {
    id: r.id,
    title: r.title,
    submitter: side('s'),
    partner: side('p'),
    link_url: r.link_url,
    audio_url: r.audio_url,
    artwork: r.artwork_url || `/api/cover/${r.id}.svg`,
    note: r.note,
    status: r.status,
    is_demo: !!r.is_demo,
    created_at: r.created_at,
    responded_at: r.responded_at,
  };
}

function getTrack(id) {
  const r = db.prepare(`${TRACK_SELECT} WHERE t.id = ?`).get(id);
  return r ? shapeTrack(r) : null;
}

function rankRegion(region, { limit = 100 } = {}) {
  const rows = db.prepare(`${STATS_SQL} WHERE ar.region = ? AND COALESCE(s.collaborators, 0) > 0 ORDER BY ${RANK_ORDER} LIMIT ?`).all(region, limit);
  // Standard competition ranking: ties share a rank (1, 2, 2, 4).
  let prev = null, rank = 0;
  return rows.map((r, i) => {
    const key = `${r.collaborators}:${r.track_count}`;
    if (key !== prev) { rank = i + 1; prev = key; }
    return { rank, ...publicArtist(r) };
  });
}

function leaders() {
  const west = rankRegion('West', { limit: 1 })[0] || null;
  const east = rankRegion('East', { limit: 1 })[0] || null;
  let shared = [];
  if (west && east) {
    const lo = Math.min(west.id, east.id), hi = Math.max(west.id, east.id);
    shared = db.prepare(`${TRACK_SELECT} WHERE t.status = 'confirmed' AND t.pair_lo = ? AND t.pair_hi = ? ORDER BY (t.audio_url IS NOT NULL) DESC, t.responded_at DESC`).all(lo, hi).map(shapeTrack);
  }
  return { west, east, shared };
}

function feed(limit = 12) {
  const tracks = db.prepare(`${TRACK_SELECT} WHERE t.status = 'confirmed' ORDER BY t.responded_at DESC LIMIT ?`).all(limit)
    .map((r) => ({ type: 'track', at: r.responded_at, track: shapeTrack(r) }));
  const seeking = db.prepare(`${STATS_SQL} WHERE ar.seeking <> '' AND ar.open_to_collab = 1 ORDER BY ar.seeking_at DESC LIMIT ?`).all(limit)
    .map((r) => ({ type: 'seeking', at: r.seeking_at, artist: publicArtist(r) }));
  const joined = db.prepare(`${STATS_SQL} WHERE ar.is_demo = 0 ORDER BY ar.created_at DESC LIMIT 5`).all()
    .map((r) => ({ type: 'joined', at: r.created_at, artist: publicArtist(r) }));
  return [...tracks, ...seeking, ...joined].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, limit);
}

function searchArtists({ q, region, genre, role, open, demo }) {
  const where = [], args = [];
  if (q) {
    where.push('(ar.name LIKE ? OR ar.city LIKE ? OR ar.genres LIKE ? OR ar.roles LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    args.push(like, like, like, like);
  }
  if (region === 'East' || region === 'West') { where.push('ar.region = ?'); args.push(region); }
  if (genre) { where.push('EXISTS (SELECT 1 FROM json_each(ar.genres) WHERE value = ?)'); args.push(genre); }
  if (role) { where.push('EXISTS (SELECT 1 FROM json_each(ar.roles) WHERE value = ?)'); args.push(role); }
  if (open === '1') where.push('ar.open_to_collab = 1');
  if (demo === 'exclude') where.push('ar.is_demo = 0');
  if (demo === 'only') where.push('ar.is_demo = 1');
  const sql = `${STATS_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ar.is_demo ASC, ${RANK_ORDER} LIMIT 200`;
  return db.prepare(sql).all(...args).map(publicArtist);
}

function artistDetail(id) {
  const artist = getArtist(id);
  if (!artist) return null;
  const history = db.prepare(`${TRACK_SELECT} WHERE t.status = 'confirmed' AND (t.submitter_id = ? OR t.partner_id = ?) ORDER BY t.responded_at DESC`).all(id, id).map(shapeTrack);
  const byPartner = new Map();
  for (const t of history) {
    const other = t.submitter.id === id ? t.partner : t.submitter;
    const e = byPartner.get(other.id) || { ...other, tracks: 0 };
    e.tracks++;
    byPartner.set(other.id, e);
  }
  const rank = rankRegion(artist.region).find((r) => r.id === id)?.rank || null;
  return { artist: { ...artist, rank }, collaborators: [...byPartner.values()].sort((a, b) => b.tracks - a.tracks || a.name.localeCompare(b.name)), history };
}

// ---------- generated artwork (SVG) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAL = {
  West: { a: '#ff7a1a', b: '#ff3d2e', deep: '#3a1206', glow: '#ffb15c' },
  East: { a: '#2f8bff', b: '#3d4dff', deep: '#071a40', glow: '#7cc4ff' },
};
function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function prng(seed) { let s = seed || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function skyline(rand, color, lit, w, base, height) {
  let x = -10, out = '';
  while (x < w) {
    const bw = 18 + rand() * 34, bh = height * (0.35 + rand() * 0.65);
    out += `<rect x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}"/>`;
    for (let wy = base - bh + 8; wy < base - 6; wy += 11) for (let wx = x + 5; wx < x + bw - 5; wx += 8) if (rand() < 0.16) out += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="3" height="4" fill="${lit}" opacity="${(0.4 + rand() * 0.6).toFixed(2)}"/>`;
    x += bw + rand() * 4;
  }
  return out;
}

function avatarSvg(artist) {
  const p = PAL[artist.region] || PAL.West;
  const rand = prng(hash(artist.name + artist.id));
  const style = (artist.avatar_style ?? hash(artist.name)) % 6;
  const G = `fill="#0d0b12" stroke="${p.glow}" stroke-width="3"`;
  const hair = [
    // beanie
    `<path d="M144 186 C144 98 256 98 256 186 Z" ${G}/><rect x="140" y="170" width="120" height="22" rx="9" ${G}/>`,
    // braids (drawn behind the head)
    `<path d="M150 190 C146 112 254 112 250 190 L266 380 L248 384 L236 240 L164 240 L152 384 L134 380 Z" fill="#0d0b12" stroke="${p.glow}" stroke-width="2.5"/>`,
    // afro (behind)
    `<circle cx="200" cy="176" r="80" ${G}/>`,
    // buzz
    `<path d="M152 186 C152 126 248 126 248 186" fill="none" stroke="${p.glow}" stroke-opacity=".55" stroke-width="2" stroke-dasharray="2 5"/>`,
    // cap
    `<path d="M148 180 C148 112 252 112 252 180 Z" ${G}/><path d="M246 172 L300 182 L248 190 Z" ${G}/>`,
    // locs bun
    `<circle cx="200" cy="108" r="26" ${G}/><path d="M150 180 C150 120 250 120 250 180 Z" ${G}/>`,
  ][style];
  const behind = style === 1 || style === 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img" aria-label="${esc(artist.name)}">
<defs>
<radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${p.a}" stop-opacity=".55"/><stop offset=".55" stop-color="${p.deep}"/><stop offset="1" stop-color="#07060b"/></radialGradient>
<linearGradient id="rim" x1="0" x2="1"><stop offset="0" stop-color="${p.glow}"/><stop offset="1" stop-color="${p.b}"/></linearGradient>
<radialGradient id="face" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#2a2233"/><stop offset="1" stop-color="#121018"/></radialGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#07060b" stop-opacity="0"/><stop offset="1" stop-color="#07060b" stop-opacity=".85"/></linearGradient>
</defs>
<rect width="400" height="500" fill="url(#bg)"/>
<g opacity=".75">${skyline(rand, p.deep, p.glow, 400, 430, 230)}</g>
<g>
${behind ? hair : ''}
<path d="M30 500 C40 390 104 342 170 322 L182 292 L218 292 L230 322 C296 342 360 390 370 500 Z" fill="#110f17" stroke="url(#rim)" stroke-width="4"/>
<path d="M170 322 L200 392 L230 322" fill="none" stroke="url(#rim)" stroke-opacity=".55" stroke-width="3"/>
<path d="M176 326 Q200 378 224 326" fill="none" stroke="${p.glow}" stroke-width="3.5" stroke-dasharray="3 4" opacity=".85"/>
<rect x="182" y="250" width="36" height="62" rx="14" fill="#141119" stroke="url(#rim)" stroke-width="3"/>
<path d="M148 192 C148 128 252 128 252 192 C252 240 230 272 200 274 C170 272 148 240 148 192 Z" fill="url(#face)" stroke="url(#rim)" stroke-width="4"/>
<ellipse cx="146" cy="200" rx="7" ry="13" fill="#141119" stroke="url(#rim)" stroke-width="2.5"/><ellipse cx="254" cy="200" rx="7" ry="13" fill="#141119" stroke="url(#rim)" stroke-width="2.5"/>
${behind ? '' : hair}
<path d="M90 420 L150 470 M310 420 L250 470" stroke="${p.glow}" stroke-opacity=".22" stroke-width="3"/>
</g>
<rect width="400" height="500" fill="url(#fade)"/>
</svg>`;
}

function coverSvg(track) {
  const a = PAL[track.s_region] || PAL.West, b = PAL[track.p_region] || PAL.East;
  const rand = prng(hash(track.title + track.id));
  const words = String(track.title).toUpperCase().split(/\s+/);
  const lines = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 10) lines[lines.length - 1] = last + ' ' + w; else lines.push(w);
  }
  const shown = lines.slice(0, 3);
  const size = Math.max(36, Math.min(78, 560 / Math.max(...shown.map((l) => l.length), 4)));
  const startY = 200 - ((shown.length - 1) * size * 0.95) / 2 + size * 0.35;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${esc(track.title)} cover">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.deep}"/><stop offset=".5" stop-color="#120a22"/><stop offset="1" stop-color="${b.deep}"/></linearGradient>
<linearGradient id="t" x1="0" x2="1"><stop offset="0" stop-color="${a.glow}"/><stop offset="1" stop-color="${b.glow}"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#g)"/>
<circle cx="${(80 + rand() * 240).toFixed(0)}" cy="${(60 + rand() * 120).toFixed(0)}" r="${(60 + rand() * 60).toFixed(0)}" fill="${a.a}" opacity=".28"/>
<circle cx="${(80 + rand() * 240).toFixed(0)}" cy="${(220 + rand() * 120).toFixed(0)}" r="${(60 + rand() * 70).toFixed(0)}" fill="${b.a}" opacity=".28"/>
<g opacity=".7">${skyline(rand, '#05040a', a.glow, 400, 400, 120)}</g>
<g transform="rotate(-8 200 200)" font-family="Anton, Impact, 'Arial Narrow', sans-serif" font-style="italic" font-weight="700" text-anchor="middle">
${shown.map((l, i) => `<text x="200" y="${(startY + i * size * 0.95).toFixed(0)}" font-size="${size.toFixed(0)}" fill="url(#t)" stroke="#05040a" stroke-width="2">${esc(l)}</text>`).join('')}
</g>
<text x="200" y="378" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="2" fill="#fff" opacity=".85">${esc(track.s_name.toUpperCase())} × ${esc(track.p_name.toUpperCase())}</text>
</svg>`;
}

module.exports = {
  GENRES, ROLES, now, titleKey, parse, STATS_SQL, TRACK_SELECT,
  publicArtist, miniArtist, getArtist, artistRow, getTrack, shapeTrack, rankRegion, leaders, feed, searchArtists, artistDetail,
  avatarSvg, coverSvg,
};
