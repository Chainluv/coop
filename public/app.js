// CO-OP single-page app. No build step: plain ES modules.

// ---------- safe HTML templating ----------
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const out = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(out).join('') : esc(v));
function html(strings, ...vals) {
  let s = '';
  strings.forEach((str, i) => { s += str; if (i < vals.length) s += out(vals[i]); });
  return raw(s);
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- icons ----------
const I = {
  play: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>'),
  pause: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor"/></svg>'),
  arrow: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  pin: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-7.2 7-12.5A7 7 0 0 0 5 9.5C5 14.8 12 22 12 22z" fill="currentColor"/><circle cx="12" cy="9.5" r="2.6" fill="#07060c"/></svg>'),
  crown: raw('<svg class="crown" viewBox="0 0 38 24" aria-hidden="true"><path d="M3 22 0 5l10 7 9-12 9 12 10-7-3 17z" fill="currentColor"/></svg>'),
  crownSm: raw('<svg viewBox="0 0 38 24" aria-hidden="true"><path d="M3 22 0 5l10 7 9-12 9 12 10-7-3 17z" fill="currentColor"/></svg>'),
  check: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  ext: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  x: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  plus: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'),
  inbox: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'),
  unlink: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H7a5 5 0 0 0 0 10h2m6-10h2a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'),
};

function chainSvg(linked) {
  const id = Math.random().toString(36).slice(2, 7);
  const [l, r] = linked ? [0, 0] : [-26, 26];
  return html`<svg class="chain ${linked ? 'linked' : 'unlinked'}" viewBox="0 0 240 150" role="img" aria-label="${linked ? 'Linked' : 'Not linked yet'}">
    <defs>
      <linearGradient id="ga${raw(id)}" x1="0" x2="1"><stop offset="0" stop-color="${linked ? '#ff8a3d' : '#5f5a74'}"/><stop offset="1" stop-color="${linked ? '#ff4fa0' : '#4a4660'}"/></linearGradient>
      <linearGradient id="gb${raw(id)}" x1="0" x2="1"><stop offset="0" stop-color="${linked ? '#b46bff' : '#4a4660'}"/><stop offset="1" stop-color="${linked ? '#3b9bff' : '#5f5a74'}"/></linearGradient>
    </defs>
    <g transform="translate(${l} 0)"><rect class="ring" x="22" y="45" width="120" height="62" rx="31" transform="rotate(-32 82 76)" stroke="url(#ga${raw(id)})"/></g>
    <g transform="translate(${r} 0)"><rect class="ring" x="98" y="45" width="120" height="62" rx="31" transform="rotate(-32 158 76)" stroke="url(#gb${raw(id)})"/></g>
    ${linked ? html`<g><path class="ring" d="M126 56 L 112 64" stroke="url(#ga${raw(id)})"/></g>` : ''}
  </svg>`;
}

// ---------- helpers ----------
async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (form) { opts.body = form; opts.headers['x-coop'] = '1'; }
  else if (method !== 'GET') { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body || {}); }
  const r = await fetch(path, opts);
  let data = {};
  try { data = await r.json(); } catch { /* empty body */ }
  if (!r.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: r.status });
  return data;
}

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; } };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

// ---------- state ----------
const state = { me: null, meta: { genres: [], roles: [] } };
const myId = () => state.me?.artist?.id;

async function loadMe() {
  try { const r = await api('/api/me'); state.me = r.user ? r : null; } catch { state.me = null; }
  renderAccount();
}

function renderAccount() {
  const acct = $('#account');
  const n = state.me?.inbox || 0;
  if (state.me?.artist) {
    const a = state.me.artist;
    acct.innerHTML = html`
      <a href="/inbox" data-link class="icon-btn inbox-icon" aria-label="Inbox${n ? `, ${n} waiting` : ''}">${I.inbox}${n ? html`<span class="count-badge">${n}</span>` : ''}</a>
      <a href="/me" data-link class="account-link"><img src="${a.photo}" alt=""><span class="acct-name">My profile</span></a>`.s;
  } else {
    acct.innerHTML = html`<a href="/login" data-link class="btn btn-ghost btn-sm">Log in</a><a href="/signup" data-link class="btn btn-primary btn-sm">Join</a>`.s;
  }
  $$('[data-inbox-badge]').forEach((b) => { b.hidden = !n; });
}

// ---------- audio player (one shared <audio>) ----------
const audio = new Audio();
audio.preload = 'none';
let currentPlayer = null;
const fmt = (t) => (Number.isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00');
function seededBars(seed, n = 56) {
  let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, (_, i) => Math.round(18 + 80 * Math.abs(Math.sin(i * 0.45 + rnd() * 1.5)) * (0.45 + rnd() * 0.55)));
}
function player(track) {
  if (track.audio_url) {
    const bars = seededBars(track.id + track.title);
    return html`<div class="player" data-player data-src="${track.audio_url}">
      <button class="play-btn" type="button" data-act="play" aria-label="Play ${track.title}">${I.play}</button>
      <div class="wave">${bars.map((h) => html`<i style="height:${h}%"></i>`)}<input type="range" min="0" max="1000" value="0" step="1" aria-label="Seek within ${track.title}"></div>
      <span class="time" aria-hidden="true"></span>
    </div>`;
  }
  if (track.link_url) return html`<a class="btn btn-sm ext-link" href="${track.link_url}" target="_blank" rel="noopener noreferrer">${I.ext} Listen on ${hostOf(track.link_url)}</a>`;
  return html`<span class="no-preview">No audio preview${track.is_demo ? ' (demo track)' : ''}</span>`;
}
function paintPlayer(el) {
  if (!el) return;
  const playing = el === currentPlayer && !audio.paused;
  const btn = $('.play-btn', el);
  btn.innerHTML = (playing ? I.pause : I.play).s;
  btn.setAttribute('aria-label', btn.getAttribute('aria-label').replace(/^(Play|Pause)/, playing ? 'Pause' : 'Play'));
  const frac = el === currentPlayer && audio.duration ? audio.currentTime / audio.duration : 0;
  const bars = $$('.wave i', el);
  const on = Math.round(frac * bars.length);
  bars.forEach((b, i) => b.classList.toggle('on', i < on));
  $('input[type=range]', el).value = Math.round(frac * 1000);
  if (el === currentPlayer) $('.time', el).textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
}
function startPlayer(el, seekFrac) {
  if (currentPlayer !== el) {
    const prev = currentPlayer;
    audio.pause();
    currentPlayer = el;
    if (prev) { paintPlayer(prev); $('.time', prev).textContent = ''; }
    audio.src = el.dataset.src;
  }
  if (seekFrac != null) {
    const go = () => { audio.currentTime = seekFrac * audio.duration; };
    if (audio.duration) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
  }
  audio.play().catch(() => toast("Couldn't play this audio.", 'err'));
}
['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended'].forEach((ev) => audio.addEventListener(ev, () => paintPlayer(currentPlayer)));
audio.addEventListener('error', () => { if (currentPlayer && audio.src) toast("This audio file couldn't be loaded.", 'err'); });
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act="play"]');
  if (!btn) return;
  const el = btn.closest('[data-player]');
  if (el === currentPlayer && !audio.paused) audio.pause(); else startPlayer(el);
});
document.addEventListener('input', (e) => {
  if (!e.target.matches('.wave input[type=range]')) return;
  const el = e.target.closest('[data-player]');
  const frac = e.target.value / 1000;
  if (el === currentPlayer && audio.duration) audio.currentTime = frac * audio.duration; else startPlayer(el, frac);
});
function stopAudio() { audio.pause(); currentPlayer = null; }

// ---------- shared components ----------
const demo = (x) => (x?.is_demo ? html` <span class="demo-badge" title="Demo content — not a real artist">Demo</span>` : '');
const avatar = (a, size = 40, cls = '') => html`<img class="avatar ${a.region} ${cls}" src="${a.photo}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" loading="lazy">`;
const regionTag = (r) => html`<span class="region-tag ${r}">${r}</span>`;
const artistLink = (a) => html`<a href="/artist/${a.id}" data-link>${a.name}</a>`;

function requestButton(a, { cls = 'btn btn-primary btn-sm', label = 'Request collab' } = {}) {
  if (a.id === myId()) return html`<a class="btn btn-sm" href="/me/edit" data-link>Edit profile</a>`;
  if (a.is_demo) return html`<a class="btn btn-sm" href="/artist/${a.id}" data-link>View profile</a>`;
  if (!a.open_to_collab) return html`<button class="btn btn-sm" disabled title="${a.name} isn't taking requests right now">Not taking requests</button>`;
  return html`<button class="${cls}" type="button" data-act="request" data-id="${a.id}" data-name="${a.name}" data-photo="${a.photo}" data-region="${a.region}">${label} ${I.arrow}</button>`;
}

function openRequestModal(target) {
  if (!state.me) { navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); toast('Log in to send a collaboration request.'); return; }
  const root = $('#modal-root');
  const prevFocus = document.activeElement;
  root.innerHTML = html`<div class="modal-backdrop" data-close>
    <form class="modal" role="dialog" aria-modal="true" aria-labelledby="req-title">
      <h2 id="req-title">Request a collab</h2>
      <div class="to">${avatar(target, 48)}<div><b>${target.name}</b><div class="help">They'll see this in their inbox and can accept or decline.</div></div></div>
      <div class="field"><label for="req-msg">Your message</label>
        <textarea id="req-msg" class="textarea" maxlength="500" required placeholder="What do you have in mind? A verse, a hook, a beat, a mix…"></textarea>
        <span class="help" id="req-count">0 / 500</span></div>
      <p class="error-text" id="req-err" role="alert"></p>
      <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary">Send request ${I.arrow}</button></div>
    </form></div>`.s;
  const form = $('form', root), ta = $('#req-msg', root);
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = $$('textarea, button', form); const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) close(); });
  ta.addEventListener('input', () => { $('#req-count', root).textContent = `${ta.value.length} / 500`; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button.btn-primary', form); btn.disabled = true;
    try {
      await api('/api/requests', { method: 'POST', body: { to_id: Number(target.id), message: ta.value } });
      close(); toast(`Request sent to ${target.name}.`);
      if (location.pathname.startsWith('/artist/')) render();
    } catch (err) { $('#req-err', root).textContent = err.message; btn.disabled = false; }
  });
  ta.focus();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act="request"]');
  if (b) openRequestModal({ id: b.dataset.id, name: b.dataset.name, photo: b.dataset.photo, region: b.dataset.region });
});

// ---------- router ----------
const routes = [
  [/^\/$/, viewArena, 'arena'],
  [/^\/discover$/, viewDiscover, 'discover'],
  [/^\/leaderboard$/, viewLeaderboard, 'leaderboard'],
  [/^\/feed$/, viewFeed, 'arena'],
  [/^\/artist\/(\d+)$/, viewArtist, null],
  [/^\/me$/, viewMe, 'me'],
  [/^\/me\/edit$/, viewEdit, 'me'],
  [/^\/submit$/, viewSubmit, 'me'],
  [/^\/inbox$/, viewInbox, 'inbox'],
  [/^\/login$/, viewLogin, 'me'],
  [/^\/signup$/, viewSignup, 'me'],
];
let renderToken = 0;
function navigate(url, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  render();
}
async function render() {
  const token = ++renderToken;
  stopAudio();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const match = routes.find(([re]) => re.test(path));
  const main = $('#main');
  const navKey = match?.[2] ?? (path.startsWith('/artist/') && Number(path.split('/')[2]) === myId() ? 'me' : null);
  $$('[data-nav]').forEach((a) => (a.dataset.nav === navKey ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  main.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const view = match ? match[1] : viewNotFound;
    const result = await view(...(match ? path.match(match[0]).slice(1) : []));
    if (token !== renderToken) return;
    main.innerHTML = result.html.s;
    document.title = result.title ? `${result.title} · CO-OP` : 'CO-OP — Make connections. Make records.';
    result.mount?.(main);
  } catch (err) {
    if (token !== renderToken) return;
    main.innerHTML = html`<div class="wrap"><div class="empty" style="margin-top:40px"><strong>Couldn't load this page</strong>${err.message}</div></div>`.s;
  }
  window.scrollTo(0, 0);
  if (document.activeElement !== document.body) main.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  if (a.getAttribute('href') !== location.pathname + location.search) navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', render);
$('.topsearch').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#topsearch-q').value.trim();
  navigate(`/discover${q ? `?q=${encodeURIComponent(q)}` : ''}`);
});

function needLogin(what) {
  return { title: 'Log in', html: html`<div class="auth-wrap"><h1 class="page-title">Log in to ${what}</h1>
    <p class="page-sub">You need a CO-OP artist account for this.</p>
    <div class="form-actions" style="justify-content:center"><a class="btn" href="/login?next=${encodeURIComponent(location.pathname + location.search)}" data-link>Log in</a><a class="btn btn-primary" href="/signup?next=${encodeURIComponent(location.pathname + location.search)}" data-link>Create an account</a></div></div>` };
}

// ---------- views: arena ----------
function leaderCard(a, side) {
  const label = side === 'west' ? 'West' : 'East';
  if (!a) {
    return html`<article class="leader ${side}"><div class="leader-label">${label}<small>Leader</small></div>
      <p class="leader-empty">No ${label} leader yet. Confirm a collaboration to claim the crown.</p></article>`;
  }
  const btn = side === 'west' ? 'btn-west' : 'btn-east';
  return html`<article class="leader ${side}" aria-label="${label} leader: ${a.name}">
    <div class="leader-portrait"><img src="${a.photo}" alt="Portrait of ${a.name}"></div>
    <div class="leader-label" aria-hidden="true">${label}<small>Leader</small></div>
    ${I.crown}
    <h2 class="leader-name"><a href="/artist/${a.id}" data-link>${a.name}</a></h2>
    <div>${demo(a)}</div>
    <div class="leader-city">${I.pin}${a.city}</div>
    <div class="leader-stat"><span class="big-num">${a.collaborators}</span><span class="stat-label">Artists<br>collaborated<br>with</span></div>
    <div class="leader-tracks">${plural(a.track_count, 'track')}</div>
    <div class="leader-actions"><a class="btn ${btn}" href="/artist/${a.id}" data-link>View profile ${I.arrow}</a></div>
  </article>`;
}

function statusStrip(d) {
  if (!d.west || !d.east) return '';
  const t = d.shared[0];
  if (!t) {
    return html`<div class="status-strip unlinked" role="status">
      <div class="status-head"><span class="check">${I.unlink}</span></div>
      <div class="status-head">These leaders haven't linked up yet.</div>
      ${d.west.id === myId() || d.east.id === myId() ? '' : html`<a class="btn btn-sm" href="/discover" data-link>Find your own collaborator ${I.arrow}</a>`}
    </div>`;
  }
  return html`<div class="status-strip" role="status">
    <div class="status-head"><span class="check">${I.check}</span>They've collaborated</div>
    <img class="shared-art" src="${t.artwork}" alt="Artwork for ${t.title}">
    <div class="shared-body">
      <div class="shared-title">${t.title} · ${t.submitter.name.toUpperCase()}<span class="x">×</span>${t.partner.name.toUpperCase()} ${demo(t)}</div>
      ${player(t)}
      ${d.shared.length > 1 ? html`<span class="shared-more">+ ${plural(d.shared.length - 1, 'more track')} together</span>` : ''}
    </div>
  </div>`;
}

function feedItem(item) {
  if (item.type === 'track') {
    const t = item.track;
    return html`<article class="card feed-item">
      <div class="feed-top"><div class="avatar-pair">${avatar(t.submitter, 34)}${avatar(t.partner, 34)}</div>
        <div><a class="who" href="/artist/${t.submitter.id}" data-link>${t.submitter.name}</a> <span class="who">×</span> <a class="who" href="/artist/${t.partner.id}" data-link>${t.partner.name}</a>${demo(t)}
        <div class="what">dropped a new collab</div></div>
        <span class="when">${timeAgo(item.at)}</span></div>
      <div class="feed-track"><img class="art" src="${t.artwork}" alt="Artwork for ${t.title}" loading="lazy">
        <div><h3>${t.title}</h3><div class="by">${t.submitter.name} × ${t.partner.name}</div>${player(t)}</div></div>
    </article>`;
  }
  const a = item.artist;
  if (item.type === 'joined') {
    return html`<article class="card feed-item"><div class="feed-top">${avatar(a, 40)}
      <div><a class="who" href="/artist/${a.id}" data-link>${a.name}</a> <span class="what">joined the ${a.region}</span><div class="what">${a.city}</div></div>
      <span class="when">${timeAgo(item.at)}</span></div>
      <div class="chips">${a.roles.map((r) => html`<span class="chip">${r}</span>`)}</div>
      <div>${requestButton(a, { label: 'Say hello' })}</div></article>`;
  }
  return html`<article class="card feed-item">
    <div class="feed-top">${avatar(a, 40)}<div><a class="who" href="/artist/${a.id}" data-link>${a.name}</a>${demo(a)} <span class="what">is looking for collaborators</span></div><span class="when">${timeAgo(item.at)}</span></div>
    <div class="feed-seek"><img class="photo" src="${a.photo}" alt="" loading="lazy">
      <div><div class="seek-note">${a.seeking}</div>
      <div class="row">${a.genres.slice(0, 4).map((g) => html`<span class="chip">${g}</span>`)}${requestButton(a, { label: 'Connect' })}</div></div></div>
  </article>`;
}

function rankRow(r) {
  return html`<a class="rank-row" href="/artist/${r.id}" data-link>
    <span class="rank-num">${r.rank}</span>${avatar(r, 44)}
    <span class="rank-name">${r.rank === 1 ? I.crownSm : ''}<span class="n">${r.name}</span>${demo(r)}</span>
    <span class="rank-meta"><b>${r.collaborators}</b> collabs</span></a>`;
}
function miniBoard(region, rows) {
  return html`<div class="card mini-board ${region}"><h3>${region}<a class="linkish" href="/leaderboard" data-link aria-label="Full ${region} rankings">All ${I.arrow}</a></h3>
    ${rows.length ? rows.map(rankRow) : html`<p class="help" style="padding:8px 16px 14px">No confirmed collabs in the ${region} yet.</p>`}</div>`;
}

async function viewArena() {
  const d = await api('/api/arena');
  const linked = d.west && d.east && d.shared.length > 0;
  const showDemoNote = store.get('coop_demo_note') !== 'hide';
  return {
    title: 'Arena',
    html: html`
    <section class="hero" aria-labelledby="hero-h">
      <div class="hero-grid">
        <div class="hero-title"><h1 id="hero-h"><span>Make connections.</span><span>Make records.</span></h1><div class="underline"></div><p>The artists bringing the most people together.</p></div>
        ${leaderCard(d.west, 'west')}
        <div class="hero-link">${chainSvg(linked)}<p class="link-caption">${d.west && d.east ? (linked ? 'Linked' : 'Not linked yet') : 'Waiting for leaders'}</p></div>
        ${leaderCard(d.east, 'east')}
        ${statusStrip(d)}
      </div>
    </section>
    <div class="wrap">
      ${showDemoNote ? html`<div class="notice" style="margin-top:24px" id="demo-note"><span class="demo-badge">Demo</span><span><strong>Sample artists and tracks are marked “Demo”.</strong> They show how the arena works. Real artists who join compete right alongside them.</span><button class="linkish" type="button" id="hide-demo-note" aria-label="Dismiss demo notice">${I.x}</button></div>` : ''}
      <div class="arena-lower">
        <section aria-labelledby="feed-h">
          <div class="section-head"><h2 id="feed-h">The Collab Feed</h2><span class="rule"></span><a class="linkish" href="/feed" data-link>See all ${I.arrow}</a></div>
          <div class="feed">${d.feed.length ? d.feed.slice(0, 6).map(feedItem) : html`<div class="empty"><strong>Quiet in here</strong>New collabs and calls for collaborators show up here.</div>`}</div>
        </section>
        <section class="ranks-col" aria-labelledby="ranks-h">
          <div class="section-head"><h2 id="ranks-h">Climb the ranks</h2><span class="rule"></span><a class="linkish" href="/leaderboard" data-link>See all ${I.arrow}</a></div>
          ${miniBoard('West', d.leaderboard.West)}
          ${miniBoard('East', d.leaderboard.East)}
          <a class="btn btn-outline-violet btn-block" href="${state.me ? '/discover?open=1' : '/signup'}" data-link>${state.me ? 'Find your next collaborator' : 'Join the arena'} ${I.arrow}</a>
        </section>
      </div>
    </div>`,
    mount(root) {
      $('#hide-demo-note', root)?.addEventListener('click', () => { store.set('coop_demo_note', 'hide'); $('#demo-note', root).remove(); });
    },
  };
}

async function viewFeed() {
  const d = await api('/api/feed?limit=40');
  return {
    title: 'Collab feed',
    html: html`<div class="wrap"><div class="page-head"><div><h1 class="page-title">The Collab Feed</h1><p class="page-sub">Fresh collaborations and artists looking for their next link-up.</p></div></div>
      <div class="feed list">${d.feed.map(feedItem)}</div></div>`,
  };
}

// ---------- views: leaderboard ----------
async function viewLeaderboard() {
  const d = await api('/api/leaderboard');
  const board = (region) => html`<section class="card board ${region}" aria-labelledby="b-${region}">
    <div class="board-head"><h2 id="b-${region}">${region}</h2><span class="help">${plural(d[region].length, 'ranked artist')}</span></div>
    <div class="col-h" aria-hidden="true"><span>#</span><span></span><span>Artist</span><span class="num">Collabs</span><span class="num">Tracks</span></div>
    ${d[region].length ? d[region].map((r) => html`<a class="rank-row" href="/artist/${r.id}" data-link aria-label="Rank ${r.rank}: ${r.name}, ${r.collaborators} collaborators, ${r.track_count} tracks">
      <span class="rank-num">${r.rank}</span>${avatar(r, 48)}
      <span class="rank-name"><span>${r.rank === 1 ? I.crownSm : ''}</span><span class="n">${r.name}<span class="sub-city">${r.city}</span></span>${demo(r)}</span>
      <span class="num"><b>${r.collaborators}</b></span><span class="num">${r.track_count}</span></a>`) : html`<p class="help" style="padding:20px">No ranked artists yet.</p>`}
  </section>`;
  const initial = state.me?.artist?.region || 'West';
  return {
    title: 'Leaderboard',
    html: html`<div class="wrap">
      <div class="page-head"><div><h1 class="page-title">Leaderboard</h1><p class="page-sub">Ranked by unique artists collaborated with. Ties go to the artist with more tracks.</p></div></div>
      <div class="seg" role="group" aria-label="Choose region" style="margin-bottom:16px">
        <button type="button" class="West" data-region="West" aria-pressed="${initial === 'West'}">West</button>
        <button type="button" class="East" data-region="East" aria-pressed="${initial === 'East'}">East</button></div>
      <div class="boards" data-show="${initial}">${board('West')}${board('East')}</div>
      <div class="card rules"><strong>How scoring works</strong>
        <span>• A collaboration counts only after the other artist confirms it.</span>
        <span>• Each collaborator counts once, no matter how many tracks you make together. Extra tracks raise your track total.</span>
        <span>• You can't collaborate with yourself, and the same song can't be logged twice by the same pair.</span>
        <span>• Your region (East or West) is set on your profile. Collaborators from either region count.</span></div>
    </div>`,
    mount(root) {
      $$('.seg button', root).forEach((b) => b.addEventListener('click', () => {
        $$('.seg button', root).forEach((x) => x.setAttribute('aria-pressed', x === b));
        $('.boards', root).dataset.show = b.dataset.region;
      }));
    },
  };
}

// ---------- views: discover ----------
function artistCard(a) {
  return html`<article class="card artist-card ${a.region}">
    <div class="top">${avatar(a, 64)}<div style="min-width:0"><h3><a href="/artist/${a.id}" data-link>${a.name}</a>${demo(a)}</h3><div class="city">${a.city}</div>
      <div style="margin-top:6px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${regionTag(a.region)}<span class="open-tag ${a.open_to_collab ? '' : 'closed'}">${a.open_to_collab ? 'Open to collab' : 'Not taking requests'}</span></div></div></div>
    <div class="body">
      ${a.roles.length ? html`<div class="roles">${a.roles.join(' · ')}</div>` : ''}
      ${a.genres.length ? html`<div class="chips">${a.genres.slice(0, 4).map((g) => html`<span class="chip">${g}</span>`)}</div>` : ''}
      <div class="stats"><span><b>${a.collaborators}</b>collaborators</span><span><b>${a.track_count}</b>tracks</span></div>
    </div>
    <div class="foot"><a class="btn btn-sm" href="/artist/${a.id}" data-link>Profile</a>${a.id === myId() || a.is_demo ? '' : requestButton(a)}</div>
  </article>`;
}

async function viewDiscover() {
  const p = new URLSearchParams(location.search);
  const opt = (list, val, any) => html`<option value="">${any}</option>${list.map((x) => html`<option ${x === val ? raw('selected') : ''}>${x}</option>`)}`;
  return {
    title: 'Discover',
    html: html`<div class="wrap">
      <div class="page-head"><div><h1 class="page-title">Discover artists</h1><p class="page-sub">Find your next link-up by name, city, region, genre, or role.</p></div>
        ${state.me ? html`<a class="btn btn-primary" href="/submit" data-link>${I.plus} Log a collab</a>` : ''}</div>
      <form class="card filters" id="filters" role="search">
        <div class="field"><label for="f-q">Search</label><input class="input" id="f-q" name="q" type="search" value="${p.get('q') || ''}" placeholder="Name, city, genre…"></div>
        <div class="field"><label for="f-region">Region</label><select class="select" id="f-region" name="region"><option value="">East & West</option><option ${p.get('region') === 'West' ? raw('selected') : ''}>West</option><option ${p.get('region') === 'East' ? raw('selected') : ''}>East</option></select></div>
        <div class="field"><label for="f-genre">Genre</label><select class="select" id="f-genre" name="genre">${opt(state.meta.genres, p.get('genre'), 'Any genre')}</select></div>
        <div class="field"><label for="f-role">Role</label><select class="select" id="f-role" name="role">${opt(state.meta.roles, p.get('role'), 'Any role')}</select></div>
        <div class="field"><label for="f-demo">Demo artists</label><select class="select" id="f-demo" name="demo"><option value="">Show</option><option value="exclude" ${p.get('demo') === 'exclude' ? raw('selected') : ''}>Hide</option><option value="only" ${p.get('demo') === 'only' ? raw('selected') : ''}>Only demo</option></select></div>
        <label class="check"><input type="checkbox" name="open" value="1" ${p.get('open') === '1' ? raw('checked') : ''}> Open to collab</label>
      </form>
      <p class="results-meta" id="results-meta" aria-live="polite"></p>
      <div class="grid-artists" id="results"></div>
    </div>`,
    mount(root) {
      const form = $('#filters', root);
      let timer, seq = 0;
      const run = async () => {
        const fd = new FormData(form);
        const qs = new URLSearchParams([...fd.entries()].filter(([, v]) => v));
        history.replaceState(null, '', `/discover${qs.toString() ? '?' + qs : ''}`);
        const mine = ++seq;
        const { artists } = await api(`/api/artists?${qs}`);
        if (mine !== seq) return;
        $('#results-meta', root).textContent = `${plural(artists.length, 'artist')} found`;
        $('#results', root).innerHTML = artists.length ? artists.map(artistCard).map(out).join('')
          : html`<div class="empty" style="grid-column:1/-1"><strong>No artists match</strong>Try a different search or clear some filters.</div>`.s;
      };
      form.addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(run, e.target.type === 'search' ? 250 : 0); });
      form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
      run().catch((e) => toast(e.message, 'err'));
    },
  };
}

// ---------- views: artist profile ----------
function trackHistoryItem(t, selfId) {
  const other = t.submitter.id === selfId ? t.partner : t.submitter;
  return html`<article class="card history-item"><img class="art" src="${t.artwork}" alt="Artwork for ${t.title}" loading="lazy">
    <div style="min-width:0"><h3>${t.title}${demo(t)}</h3><div class="by">with ${artistLink(other)} · ${timeAgo(t.responded_at)}</div>${player(t)}</div></article>`;
}

async function viewArtist(id) {
  const d = await api(`/api/artists/${id}`);
  const a = d.artist, own = a.id === myId(), rel = d.relationship;
  let actions;
  if (own) {
    actions = html`<a class="btn btn-primary" href="/me/edit" data-link>Edit profile</a><a class="btn" href="/submit" data-link>${I.plus} Log a collab</a><button class="btn btn-ghost" type="button" id="logout">Log out</button>`;
  } else if (a.is_demo) {
    actions = html`<p class="notice"><span class="demo-badge">Demo</span>This is a sample artist. Demo artists can't receive requests or confirm collaborations.</p>`;
  } else if (rel?.openRequest) {
    actions = html`<a class="btn" href="/inbox" data-link>${rel.openRequest.from_id === myId() ? 'Request sent — waiting' : 'They sent you a request'} ${I.arrow}</a><a class="btn" href="/submit?partner=${a.id}" data-link>${I.plus} Log a collab together</a>`;
  } else {
    actions = html`${requestButton(a, { cls: 'btn btn-primary', label: 'Request collaboration' })}${state.me ? html`<a class="btn" href="/submit?partner=${a.id}" data-link>${I.plus} Log a collab together</a>` : ''}`;
  }
  return {
    title: a.name,
    html: html`
    <section class="profile-hero ${a.region}"><div class="wrap">
      <img class="profile-photo" src="${a.photo}" alt="Photo of ${a.name}">
      <div style="min-width:0">
        ${a.rank === 1 ? html`<div style="color:var(--gold);width:40px">${I.crown}</div>` : ''}
        <h1 class="profile-name">${a.name}</h1>
        <div class="profile-meta">${regionTag(a.region)}<span>${a.city}</span>${a.rank ? html`<span>#${a.rank} in the ${a.region}</span>` : ''}<span class="open-tag ${a.open_to_collab ? '' : 'closed'}">${a.open_to_collab ? 'Open to collab' : 'Not taking requests'}</span>${demo(a)}</div>
        <div class="profile-stats"><div><b>${a.collaborators}</b><span>Collaborators</span></div><div><b>${a.track_count}</b><span>Tracks</span></div></div>
        <div class="profile-actions">${actions}</div>
        ${rel?.collaborated ? html`<p class="help" style="margin-top:10px">✓ You've collaborated with ${a.name}.</p>` : ''}
        ${rel?.pendingTracks ? html`<p class="help" style="margin-top:6px">${plural(rel.pendingTracks, 'track')} between you awaiting confirmation.</p>` : ''}
      </div></div></section>
    <div class="wrap profile-body">
      <div>
        <section><div class="section-head"><h2>About</h2><span class="rule"></span></div>
          ${a.bio ? html`<p class="bio">${a.bio}</p>` : html`<p class="help">${own ? 'Add a short bio so people know your sound.' : 'No bio yet.'}</p>`}</section>
        <section><div class="section-head"><h2>Collaborators</h2><span class="rule"></span><span class="help">${plural(d.collaborators.length, 'artist')}</span></div>
          ${d.collaborators.length ? html`<div class="collab-grid">${d.collaborators.map((c) => html`<a class="collab-tile" href="/artist/${c.id}" data-link>${avatar(c, 40)}<span><b>${c.name}</b><small>${plural(c.tracks, 'track')}</small></span></a>`)}</div>`
            : html`<div class="empty"><strong>No confirmed collaborators yet</strong>${own ? 'Log a collab and ask your partner to confirm it.' : ''}</div>`}</section>
        <section><div class="section-head"><h2>Collab history</h2><span class="rule"></span></div>
          ${d.history.length ? html`<div class="history">${d.history.map((t) => trackHistoryItem(t, a.id))}</div>` : html`<div class="empty">No confirmed tracks yet.</div>`}</section>
      </div>
      <aside class="profile-side">
        ${a.seeking ? html`<div class="card side-card"><h3>Looking for</h3><p>${a.seeking}</p></div>` : ''}
        <div class="card side-card"><h3>Roles</h3>${a.roles.length ? html`<div class="chips">${a.roles.map((r) => html`<span class="chip">${r}</span>`)}</div>` : html`<p class="help">None listed.</p>`}</div>
        <div class="card side-card"><h3>Genres</h3>${a.genres.length ? html`<div class="chips">${a.genres.map((g) => html`<span class="chip">${g}</span>`)}</div>` : html`<p class="help">None listed.</p>`}</div>
        <div class="card side-card"><h3>Music links</h3>${a.links.length ? html`<div class="links-list">${a.links.map((l) => html`<a href="${l.url}" target="_blank" rel="noopener noreferrer">${I.ext}<b>${l.label}</b><span>${hostOf(l.url)}</span></a>`)}</div>` : html`<p class="help">No links yet.</p>`}</div>
      </aside>
    </div>`,
    mount(root) {
      $('#logout', root)?.addEventListener('click', async () => {
        await api('/api/auth/logout', { method: 'POST' });
        await loadMe(); toast('Logged out.'); navigate('/');
      });
    },
  };
}

async function viewMe() {
  if (!state.me) return needLogin('see your profile');
  return viewArtist(myId());
}

// ---------- views: edit profile ----------
const pills = (name, list, selected) => html`<div class="pills">${list.map((x) => html`<label class="pill"><input type="checkbox" name="${name}" value="${x}" ${selected.includes(x) ? raw('checked') : ''}><span>${x}</span></label>`)}</div>`;
const regionPick = (val) => html`<div class="region-pick" role="radiogroup" aria-label="Region">
  <label class="West"><input type="radio" name="region" value="West" required ${val === 'West' ? raw('checked') : ''}>West</label>
  <label class="East"><input type="radio" name="region" value="East" required ${val === 'East' ? raw('checked') : ''}>East</label></div>`;
const linkRow = (l = { label: '', url: '' }) => html`<div class="link-row"><input class="input" name="link_label" placeholder="Label (e.g. Spotify)" value="${l.label}" maxlength="30" aria-label="Link label"><input class="input" name="link_url" type="url" placeholder="https://…" value="${l.url}" aria-label="Link URL"><button type="button" class="icon-btn" data-remove-link aria-label="Remove link">${I.x}</button></div>`;

async function viewEdit() {
  if (!state.me) return needLogin('edit your profile');
  const a = (await api(`/api/artists/${myId()}`)).artist;
  return {
    title: 'Edit profile',
    html: html`<div class="wrap form-page">
      <div class="page-head"><div><h1 class="page-title">Edit profile</h1><p class="page-sub">This is how other artists find you.</p></div><a class="btn btn-ghost" href="/me" data-link>View profile</a></div>
      <div class="card form" style="margin-bottom:16px">
        <div class="field"><span class="label">Profile photo</span>
          <div class="photo-edit"><img id="photo-preview" src="${a.photo}" alt="Current profile photo">
            <div style="display:grid;gap:8px"><label class="btn btn-sm" for="photo-file">Upload photo</label><input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only">
            ${a.photo.startsWith('/uploads/') ? html`<button type="button" class="btn btn-sm btn-ghost" id="photo-remove">Remove photo</button>` : ''}
            <span class="help">JPG, PNG, WEBP or GIF, up to 5 MB.</span></div></div></div>
      </div>
      <form class="card form" id="edit-form" novalidate>
        <div class="form-row">
          <div class="field"><label for="e-name">Artist name</label><input class="input" id="e-name" name="name" value="${a.name}" maxlength="40" required></div>
          <div class="field"><label for="e-city">City</label><input class="input" id="e-city" name="city" value="${a.city}" maxlength="60" required></div>
        </div>
        <div class="field"><span class="label">Region</span>${regionPick(a.region)}<span class="help">You rank against artists in your region.</span></div>
        <label class="switch" for="e-open"><span><b>Open to collaborating</b><br><span class="help">Others can send you requests when this is on.</span></span><input type="checkbox" id="e-open" name="open_to_collab" ${a.open_to_collab ? raw('checked') : ''}></label>
        <div class="field"><label for="e-seeking">What are you looking for? <span class="help">(optional, shows in the feed)</span></label><input class="input" id="e-seeking" name="seeking" value="${a.seeking}" maxlength="200" placeholder="e.g. Looking for a producer for a soulful rap EP"></div>
        <div class="field"><label for="e-bio">Bio</label><textarea class="textarea" id="e-bio" name="bio" maxlength="400">${a.bio}</textarea></div>
        <div class="field"><span class="label">Roles</span>${pills('roles', state.meta.roles, a.roles)}</div>
        <div class="field"><span class="label">Genres <span class="help">(up to 5)</span></span>${pills('genres', state.meta.genres, a.genres)}</div>
        <div class="field"><span class="label">Music links</span><div class="link-rows" id="link-rows">${(a.links.length ? a.links : [undefined]).map((l) => linkRow(l))}</div>
          <button type="button" class="linkish" id="add-link">${I.plus} Add link</button></div>
        <p class="error-text" id="edit-err" role="alert"></p>
        <div class="form-actions"><a class="btn" href="/me" data-link>Cancel</a><button class="btn btn-primary">Save profile</button></div>
      </form></div>`,
    mount(root) {
      const form = $('#edit-form', root);
      $('#add-link', root).addEventListener('click', () => { if ($$('.link-row', root).length < 6) $('#link-rows', root).insertAdjacentHTML('beforeend', linkRow().s); });
      root.addEventListener('click', (e) => { const b = e.target.closest('[data-remove-link]'); if (b) b.closest('.link-row').remove(); });
      form.addEventListener('change', (e) => {
        if (e.target.name === 'genres' && $$('input[name=genres]:checked', form).length > 5) { e.target.checked = false; toast('Pick up to 5 genres.', 'err'); }
      });
      $('#photo-file', root).addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const fd = new FormData(); fd.append('photo', f);
        try { const r = await api('/api/me/photo', { method: 'POST', form: fd }); $('#photo-preview', root).src = r.artist.photo; await loadMe(); toast('Photo updated.'); render(); }
        catch (err) { toast(err.message, 'err'); }
      });
      $('#photo-remove', root)?.addEventListener('click', async () => { await api('/api/me/photo', { method: 'DELETE' }); await loadMe(); toast('Photo removed.'); render(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const labels = fd.getAll('link_label'), urls = fd.getAll('link_url');
        const body = {
          name: fd.get('name'), city: fd.get('city'), region: fd.get('region'), bio: fd.get('bio'), seeking: fd.get('seeking'),
          open_to_collab: $('#e-open', form).checked, roles: fd.getAll('roles'), genres: fd.getAll('genres'),
          links: urls.map((u, i) => ({ label: labels[i].trim(), url: u.trim() })).filter((l) => l.url),
        };
        const btn = $('button.btn-primary', form); btn.disabled = true;
        try { await api('/api/me/artist', { method: 'PUT', body }); await loadMe(); toast('Profile saved.'); navigate('/me'); }
        catch (err) { $('#edit-err', root).textContent = err.message; btn.disabled = false; }
      });
    },
  };
}

// ---------- views: submit collab ----------
async function viewSubmit() {
  if (!state.me) return needLogin('log a collaboration');
  const pre = new URLSearchParams(location.search).get('partner');
  let partner = null;
  if (pre && Number(pre) !== myId()) { try { const a = (await api(`/api/artists/${pre}`)).artist; if (!a.is_demo) partner = a; } catch { /* ignore */ } }
  return {
    title: 'Log a collab',
    html: html`<div class="wrap form-page">
      <div class="page-head"><div><h1 class="page-title">Log a collab</h1><p class="page-sub">Made a track with someone? Log it here. It counts toward the leaderboard once they confirm it.</p></div></div>
      <form class="card form" id="submit-form" novalidate>
        <div class="field"><span class="label" id="partner-label">Who did you make it with?</span><div id="partner-slot"></div></div>
        <div class="field"><label for="s-title">Track title</label><input class="input" id="s-title" name="title" maxlength="80" required></div>
        <div class="field"><label for="s-link">Music link</label><input class="input" id="s-link" name="link_url" type="url" placeholder="https://open.spotify.com/…, SoundCloud, YouTube…"></div>
        <div class="form-row">
          <div class="field"><label for="s-audio">…or upload audio</label><input class="input" id="s-audio" name="audio" type="file" accept="audio/*"><span class="help">MP3, WAV, M4A, AAC, OGG or FLAC, up to 20 MB.</span></div>
          <div class="field"><label for="s-art">Cover art <span class="help">(optional)</span></label><input class="input" id="s-art" name="artwork" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><span class="help">We'll generate one if you skip this.</span></div>
        </div>
        <div class="field"><label for="s-note">Note to your partner <span class="help">(optional)</span></label><input class="input" id="s-note" name="note" maxlength="280"></div>
        <div class="notice">Each artist counts once toward your collaborator total. More tracks with the same artist raise your track count.</div>
        <p class="error-text" id="submit-err" role="alert"></p>
        <div class="form-actions"><button class="btn btn-primary">Send for confirmation ${I.arrow}</button></div>
      </form></div>`,
    mount(root) {
      const slot = $('#partner-slot', root);
      const showPicked = () => {
        slot.innerHTML = html`<div class="picked">${avatar(partner, 40)}<div><b>${partner.name}</b><div class="help">${partner.city} · ${partner.region}</div></div><button type="button" class="linkish" id="change-partner">Change</button></div>`.s;
        $('#change-partner', slot).addEventListener('click', () => { partner = null; showPicker(); $('#partner-q', slot).focus(); });
      };
      const showPicker = () => {
        slot.innerHTML = html`<div class="picker"><input class="input" id="partner-q" type="search" placeholder="Search CO-OP artists…" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="partner-list" aria-labelledby="partner-label"><div class="picker-list" id="partner-list" role="listbox" hidden></div></div>`.s;
        const q = $('#partner-q', slot), list = $('#partner-list', slot);
        let t, seq = 0, opts = [], active = -1;
        const setActive = (i) => { active = i; $$('.picker-opt', list).forEach((o, j) => o.setAttribute('aria-selected', j === i)); };
        const choose = (a) => { partner = a; showPicked(); };
        const search = async () => {
          const mine = ++seq;
          const { artists } = await api(`/api/artists?demo=exclude&q=${encodeURIComponent(q.value.trim())}`);
          if (mine !== seq) return;
          opts = artists.filter((a) => a.id !== myId()).slice(0, 20);
          list.hidden = false; q.setAttribute('aria-expanded', 'true');
          list.innerHTML = opts.length ? opts.map((a, i) => html`<button type="button" class="picker-opt" role="option" data-i="${i}" aria-selected="false">${avatar(a, 34)}<span><b>${a.name}</b><small>${a.city} · ${a.region}</small></span></button>`).map(out).join('')
            : html`<p class="help" style="padding:12px">No real artists match yet. Demo artists can't confirm collabs, so invite your partner to join CO-OP.</p>`.s;
          active = -1;
        };
        q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 200); });
        q.addEventListener('focus', search);
        q.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(opts.length - 1, active + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); }
          if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(opts[active]); }
          if (e.key === 'Escape') { list.hidden = true; q.setAttribute('aria-expanded', 'false'); }
        });
        list.addEventListener('click', (e) => { const o = e.target.closest('.picker-opt'); if (o) choose(opts[Number(o.dataset.i)]); });
      };
      partner ? showPicked() : showPicker();
      const form = $('#submit-form', root);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#submit-err', root);
        if (!partner) { err.textContent = 'Pick the artist you collaborated with.'; return; }
        const fd = new FormData(form);
        fd.append('partner_id', partner.id);
        if (!$('#s-audio', form).files.length) fd.delete('audio');
        if (!$('#s-art', form).files.length) fd.delete('artwork');
        const btn = $('button.btn-primary', form); btn.disabled = true; btn.textContent = 'Sending…';
        try { await api('/api/tracks', { method: 'POST', form: fd }); toast(`Sent to ${partner.name} for confirmation.`); navigate('/inbox'); }
        catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.innerHTML = html`Send for confirmation ${I.arrow}`.s; }
      });
    },
  };
}

// ---------- views: inbox ----------
async function viewInbox() {
  if (!state.me) return needLogin('see your inbox');
  const d = await api('/api/inbox');
  const needs = d.incomingTracks.length + d.incomingRequests.length;
  const trackBox = (t, incoming) => {
    const other = incoming ? t.submitter : t.partner;
    return html`<article class="card inbox-item">
      <div class="head">${avatar(other, 44)}<div><b>${artistLink(other)}</b> <span class="help">${incoming ? 'says you made a track together' : 'needs to confirm your track'}</span></div><span class="when">${timeAgo(t.created_at)}</span></div>
      <div class="inbox-track"><img src="${t.artwork}" alt=""><div style="min-width:0"><b style="font:700 19px var(--cond)">${t.title}</b>${t.note ? html`<p class="help">“${t.note}”</p>` : ''}<div style="margin-top:8px">${player(t)}</div></div></div>
      <div class="actions">${incoming
        ? html`<button class="btn btn-primary" data-do="/api/tracks/${t.id}/confirm" data-ok="Confirmed! It now counts for both of you.">${I.check} Confirm</button><button class="btn btn-danger" data-do="/api/tracks/${t.id}/decline" data-ok="Declined.">Decline</button>`
        : html`<button class="btn btn-sm btn-ghost" data-do="/api/tracks/${t.id}/cancel" data-ok="Submission withdrawn.">Withdraw</button>`}</div>
    </article>`;
  };
  const reqBox = (r, incoming) => {
    const other = incoming ? r.from : r.to;
    return html`<article class="card inbox-item">
      <div class="head">${avatar(other, 44)}<div><b>${artistLink(other)}</b> <span class="help">${incoming ? 'wants to collaborate' : 'hasn’t answered yet'}</span></div><span class="when">${timeAgo(r.created_at)}</span></div>
      <div class="msg">${r.message}</div>
      ${incoming ? html`<div class="actions"><button class="btn btn-primary" data-do="/api/requests/${r.id}/accept" data-ok="Accepted! Reach out and make something.">Accept</button><button class="btn btn-danger" data-do="/api/requests/${r.id}/decline" data-ok="Declined.">Decline</button></div>` : ''}
    </article>`;
  };
  const histRow = (h) => {
    if (h.kind === 'request') {
      const other = h.from.id === myId() ? h.to : h.from;
      return html`<div class="history-row"><span class="status-pill ${h.status}">${h.status}</span><span>Collab request ${h.from.id === myId() ? 'to' : 'from'} ${artistLink(other)}</span>
        ${h.status === 'accepted' ? html`<a class="btn btn-sm" href="/submit?partner=${other.id}" data-link>${I.plus} Log a track together</a>` : ''}<span class="when">${timeAgo(h.at)}</span></div>`;
    }
    const other = h.submitter.id === myId() ? h.partner : h.submitter;
    return html`<div class="history-row"><span class="status-pill ${h.status}">${h.status}</span><span>“${h.title}” with ${artistLink(other)}</span><span class="when">${timeAgo(h.at)}</span></div>`;
  };
  return {
    title: 'Inbox',
    html: html`<div class="wrap" style="max-width:900px">
      <div class="page-head"><div><h1 class="page-title">Inbox</h1><p class="page-sub">Confirm collabs, answer requests, and track what you've sent.</p></div><a class="btn btn-primary" href="/submit" data-link>${I.plus} Log a collab</a></div>
      <section class="inbox-section"><h2>Needs your response ${needs ? html`<span class="count">${needs}</span>` : ''}</h2>
        ${needs ? html`<div class="inbox-list">${d.incomingTracks.map((t) => trackBox(t, true))}${d.incomingRequests.map((r) => reqBox(r, true))}</div>` : html`<div class="empty"><strong>You're all caught up</strong>New collab confirmations and requests land here.</div>`}</section>
      <section class="inbox-section"><h2>Waiting on others</h2>
        ${d.outgoingTracks.length + d.outgoingRequests.length ? html`<div class="inbox-list">${d.outgoingTracks.map((t) => trackBox(t, false))}${d.outgoingRequests.map((r) => reqBox(r, false))}</div>` : html`<div class="empty">Nothing pending.</div>`}</section>
      <section class="inbox-section"><h2>History</h2>
        ${d.history.length ? html`<div class="card">${d.history.map(histRow)}</div>` : html`<div class="empty">No history yet.</div>`}</section>
    </div>`,
    mount(root) {
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-do]'); if (!b) return;
        b.disabled = true;
        try { await api(b.dataset.do, { method: 'POST' }); toast(b.dataset.ok); await loadMe(); render(); }
        catch (err) { toast(err.message, 'err'); b.disabled = false; }
      });
    },
  };
}

// ---------- views: auth ----------
const nextUrl = () => { const n = new URLSearchParams(location.search).get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : null; };

function viewLogin() {
  if (state.me) { setTimeout(() => navigate(nextUrl() || '/me', { replace: true })); return { html: html`` }; }
  return {
    title: 'Log in',
    html: html`<div class="auth-wrap"><h1 class="page-title">Welcome back</h1><p class="page-sub">Log in to your CO-OP artist account.</p>
      <form class="card form" id="login-form">
        <div class="field"><label for="l-email">Email</label><input class="input" id="l-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="l-pw">Password</label><input class="input" id="l-pw" name="password" type="password" autocomplete="current-password" required></div>
        <p class="error-text" id="login-err" role="alert"></p>
        <button class="btn btn-primary btn-block">Log in</button>
      </form><p class="auth-switch">New to CO-OP? <a href="/signup${location.search}" data-link>Create an artist account</a></p></div>`,
    mount(root) {
      $('#login-form', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try { await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(fd) }); await loadMe(); toast(`Welcome back, ${state.me.artist.name}.`); navigate(nextUrl() || '/', { replace: true }); }
        catch (err) { $('#login-err', root).textContent = err.message; }
      });
    },
  };
}

function viewSignup() {
  if (state.me) { setTimeout(() => navigate('/me', { replace: true })); return { html: html`` }; }
  return {
    title: 'Join',
    html: html`<div class="auth-wrap" style="max-width:560px"><h1 class="page-title">Join the arena</h1><p class="page-sub">Create your artist profile. Collaborate with more artists to climb your region's leaderboard.</p>
      <form class="card form" id="signup-form" novalidate>
        <div class="field"><label for="su-name">Artist name</label><input class="input" id="su-name" name="name" maxlength="40" required autocomplete="nickname"></div>
        <div class="field"><label for="su-city">City</label><input class="input" id="su-city" name="city" maxlength="60" required placeholder="e.g. Atlanta, GA" autocomplete="address-level2"></div>
        <div class="field"><span class="label">Rep your coast</span>${regionPick('')}</div>
        <div class="field"><span class="label">What do you do? <span class="help">(pick any)</span></span>${pills('roles', state.meta.roles, [])}</div>
        <div class="field"><label for="su-email">Email</label><input class="input" id="su-email" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label for="su-pw">Password</label><input class="input" id="su-pw" name="password" type="password" minlength="8" required autocomplete="new-password"><span class="help">At least 8 characters.</span></div>
        <p class="error-text" id="signup-err" role="alert"></p>
        <button class="btn btn-primary btn-block">Create account ${I.arrow}</button>
      </form><p class="auth-switch">Already have an account? <a href="/login${location.search}" data-link>Log in</a></p></div>`,
    mount(root) {
      $('#signup-form', root).addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const body = { name: fd.get('name'), city: fd.get('city'), region: fd.get('region'), roles: fd.getAll('roles'), email: fd.get('email'), password: fd.get('password') };
        const btn = $('button.btn-primary', e.target); btn.disabled = true;
        try { await api('/api/auth/signup', { method: 'POST', body }); await loadMe(); toast('Welcome to CO-OP! Finish your profile so people can find you.'); navigate(nextUrl() || '/me/edit', { replace: true }); }
        catch (err) { $('#signup-err', root).textContent = err.message; btn.disabled = false; }
      });
    },
  };
}

function viewNotFound() {
  return { title: 'Not found', html: html`<div class="wrap"><div class="empty" style="margin-top:48px"><strong>Page not found</strong><a href="/" data-link class="btn" style="margin-top:12px">Back to the arena</a></div></div>` };
}

// ---------- boot ----------
(async () => {
  try { state.meta = await api('/api/meta'); } catch { /* fall back to empty lists */ }
  await loadMe();
  render();
})();
