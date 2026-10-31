// End-to-end API tests against a throwaway database.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coop-test-'));
process.env.COOP_DATA_DIR = tmp;
const app = require('../server/index.js');

let server, base;
before(async () => { server = app.listen(0); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const headers = { cookie };
    let payload;
    if (body instanceof FormData) { payload = body; headers['x-coop'] = '1'; }
    else if (method !== 'GET') { headers['content-type'] = 'application/json'; payload = JSON.stringify(body || {}); }
    const r = await fetch(base + url, { method, headers, body: payload });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
}
async function signup(c, name, region) {
  const r = await c('POST', '/api/auth/signup', { email: `${name.toLowerCase()}@test.dev`, password: 'password123', name, city: 'Test City', region });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return (await c('GET', '/api/me')).body.artist;
}
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const stats = async (c, id) => (await c('GET', `/api/artists/${id}`)).body.artist;

test('collaboration scoring rules', async () => {
  const A = client(), B = client(), C = client();
  const a = await signup(A, 'Alpha', 'West');
  const b = await signup(B, 'Bravo', 'East');
  const c = await signup(C, 'Charlie', 'West');

  // self-collab and demo partner are rejected
  assert.strictEqual((await A('POST', '/api/tracks', form({ partner_id: a.id, title: 'Solo', link_url: 'https://x.dev/1' }))).status, 400);
  const demoId = (await A('GET', '/api/artists?demo=only')).body.artists[0].id;
  assert.strictEqual((await A('POST', '/api/tracks', form({ partner_id: demoId, title: 'Demo', link_url: 'https://x.dev/1' }))).status, 400);
  // a link or audio file is required
  assert.strictEqual((await A('POST', '/api/tracks', form({ partner_id: b.id, title: 'Nothing' }))).status, 400);

  // pending submission doesn't count
  const t1 = await A('POST', '/api/tracks', form({ partner_id: b.id, title: 'First Song', link_url: 'https://x.dev/1' }));
  assert.strictEqual(t1.status, 201);
  assert.strictEqual((await stats(A, a.id)).collaborators, 0);

  // duplicate (same pair, same title, any casing/punctuation, either direction) is rejected
  assert.strictEqual((await B('POST', '/api/tracks', form({ partner_id: a.id, title: 'first song!', link_url: 'https://x.dev/2' }))).status, 409);

  // only the partner can confirm
  assert.strictEqual((await A('POST', `/api/tracks/${t1.body.track.id}/confirm`)).status, 403);
  assert.strictEqual((await B('POST', `/api/tracks/${t1.body.track.id}/confirm`)).status, 200);
  assert.strictEqual((await B('POST', `/api/tracks/${t1.body.track.id}/confirm`)).status, 409);
  let sa = await stats(A, a.id);
  assert.deepStrictEqual([sa.collaborators, sa.track_count], [1, 1]);

  // second track with the same partner: tracks go up, collaborators don't
  const t2 = await B('POST', '/api/tracks', form({ partner_id: a.id, title: 'Second Song', link_url: 'https://x.dev/3' }));
  await A('POST', `/api/tracks/${t2.body.track.id}/confirm`);
  sa = await stats(A, a.id);
  assert.deepStrictEqual([sa.collaborators, sa.track_count], [1, 2]);

  // declined submissions don't count, and the same title can be retried later
  const t3 = await A('POST', '/api/tracks', form({ partner_id: c.id, title: 'Maybe', link_url: 'https://x.dev/4' }));
  await C('POST', `/api/tracks/${t3.body.track.id}/decline`);
  assert.strictEqual((await stats(A, a.id)).collaborators, 1);
  const t4 = await A('POST', '/api/tracks', form({ partner_id: c.id, title: 'Maybe', link_url: 'https://x.dev/4' }));
  assert.strictEqual(t4.status, 201);
  await C('POST', `/api/tracks/${t4.body.track.id}/confirm`);
  sa = await stats(A, a.id);
  assert.deepStrictEqual([sa.collaborators, sa.track_count], [2, 3]);

  // leaderboard reflects confirmed collabs only
  const lb = (await A('GET', '/api/leaderboard')).body;
  assert.ok(lb.West.some((r) => r.id === a.id && r.collaborators === 2));
  assert.ok(lb.East.some((r) => r.id === b.id && r.collaborators === 1));
});

test('collaboration requests and inbox', async () => {
  const D = client(), E = client();
  const d = await signup(D, 'Delta', 'East');
  const e = await signup(E, 'Echo', 'West');
  assert.strictEqual((await D('POST', '/api/requests', { to_id: d.id, message: 'hi' })).status, 400);
  assert.strictEqual((await D('POST', '/api/requests', { to_id: e.id, message: '' })).status, 400);
  const r = await D('POST', '/api/requests', { to_id: e.id, message: 'Want a hook?' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual((await E('POST', '/api/requests', { to_id: d.id, message: 'dupe' })).status, 409);
  assert.strictEqual((await E('GET', '/api/me')).body.inbox, 1);
  const inbox = (await E('GET', '/api/inbox')).body;
  assert.strictEqual(inbox.incomingRequests[0].message, 'Want a hook?');
  assert.strictEqual((await D('POST', `/api/requests/${r.body.id}/accept`)).status, 404);
  assert.strictEqual((await E('POST', `/api/requests/${r.body.id}/accept`)).status, 200);
  assert.strictEqual((await E('GET', '/api/me')).body.inbox, 0);

  // closed artists can't be requested
  await E('PUT', '/api/me/artist', { open_to_collab: false });
  assert.strictEqual((await D('POST', '/api/requests', { to_id: e.id, message: 'again?' })).status, 400);
});

test('auth and profile validation', async () => {
  const F = client();
  assert.strictEqual((await F('PUT', '/api/me/artist', { bio: 'x' })).status, 401);
  assert.strictEqual((await F('POST', '/api/auth/signup', { email: 'bad', password: 'password123', name: 'F', city: 'X', region: 'West' })).status, 400);
  assert.strictEqual((await F('POST', '/api/auth/signup', { email: 'f@test.dev', password: 'short', name: 'F', city: 'X', region: 'West' })).status, 400);
  assert.strictEqual((await F('POST', '/api/auth/signup', { email: 'f@test.dev', password: 'password123', name: 'F', city: 'X', region: 'North' })).status, 400);
  await signup(F, 'Foxtrot', 'West');
  assert.strictEqual((await F('PUT', '/api/me/artist', { links: [{ label: 'x', url: 'javascript:alert(1)' }] })).status, 400);
  const ok = await F('PUT', '/api/me/artist', { genres: ['Soul', 'Fake'], roles: ['Producer'], links: [{ label: 'SC', url: 'https://soundcloud.com/f' }] });
  assert.deepStrictEqual(ok.body.artist.genres, ['Soul']);
  await F('POST', '/api/auth/logout');
  assert.strictEqual((await F('GET', '/api/me')).body.user, null);
  assert.strictEqual((await F('POST', '/api/auth/login', { email: 'foxtrot@test.dev', password: 'wrong-pass' })).status, 401);
  assert.strictEqual((await F('POST', '/api/auth/login', { email: 'foxtrot@test.dev', password: 'password123' })).status, 200);
});

test('writes without JSON or the app header are refused', async () => {
  const r = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
  assert.strictEqual(r.status, 403);
});
