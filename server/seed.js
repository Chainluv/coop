// Demo content so the arena feels alive on first launch.
// Everything inserted here is flagged is_demo = 1 and labelled "Demo" in the UI.
const { db, tx } = require('./db');
const { titleKey } = require('./core');

const W = 'West', E = 'East';
const ARTISTS = [
  // key, name, city, region, roles, genres, style, bio, seeking
  ['kai', 'Kai Nova', 'Los Angeles, CA', W, ['Rapper', 'Songwriter'], ['Hip Hop', 'Trap'], 0, 'South LA storyteller. Writes fast, records faster, and never turns down a session with someone new.'],
  ['milo', 'Milo', 'Oakland, CA', W, ['Rapper'], ['Hip Hop', 'Alternative'], 3, 'Bay Area lyricist with a soft spot for weird samples.'],
  ['saint', 'Saint', 'Long Beach, CA', W, ['Singer', 'Songwriter'], ['R&B', 'Soul'], 4, 'Falsetto, harmonies, late-night hooks.'],
  ['jaylen', 'Jaylen', 'Seattle, WA', W, ['Producer'], ['Hip Hop', 'Soul', 'Lo-fi'], 5, 'Rainy-day drums and dusty keys. Sends stems same day.'],
  ['luna', 'Luna Reyes', 'San Diego, CA', W, ['Singer'], ['Latin', 'R&B', 'Pop'], 1, 'Bilingual R&B from the border. Loves a live bass player.'],
  ['dex', 'Dex Monroe', 'Phoenix, AZ', W, ['Producer', 'Engineer'], ['Trap', 'Electronic'], 4, 'Desert trap producer. Mixes everything he makes.', 'Beat pack ready — looking for vocalists in Phoenix or remote. Dark melodic trap, 140–160 BPM.'],
  ['ivy', 'Ivy Kade', 'Portland, OR', W, ['Singer', 'Songwriter', 'Instrumentalist'], ['Indie', 'Alternative'], 2, 'Guitar-first songwriter drifting toward hip hop.', 'Need a rapper for a moody indie-rap crossover. Verse slot is open.'],
  ['rook', 'Rook', 'Las Vegas, NV', W, ['Rapper'], ['Drill', 'Hip Hop'], 0, 'Vegas drill. Short verses, big energy.'],
  ['sol', 'Sol Avery', 'Denver, CO', W, ['Producer', 'Instrumentalist'], ['Lo-fi', 'Jazz'], 2, 'Plays sax over his own beats. Mile-high chill.'],
  ['tavi', 'Tavi', 'Sacramento, CA', W, ['Engineer'], ['Hip Hop', 'R&B'], 3, 'Mixing and mastering for independent artists.'],
  ['marisol', 'Marisol', 'Los Angeles, CA', W, ['Singer'], ['Pop', 'R&B'], 1, 'Pop toplines with R&B runs.'],
  ['kenji', 'Kenji Park', 'San Francisco, CA', W, ['Producer', 'DJ'], ['Electronic', 'Pop'], 3, 'Club-ready pop production and DJ edits.'],
  ['bree', 'Bree Lux', 'Inglewood, CA', W, ['Rapper', 'Singer'], ['Hip Hop', 'R&B'], 5, 'Raps like she sings and sings like she raps.'],
  ['noah', 'Noah Vale', 'Salt Lake City, UT', W, ['Engineer', 'Producer'], ['Rock', 'Alternative'], 4, 'Analog tape nerd. Rock drums on rap records.'],

  ['zaya', 'Zaya', 'Brooklyn, NY', E, ['Singer', 'Rapper'], ['R&B', 'Hip Hop'], 1, 'Brooklyn-born singer-rapper. Every collab is a new neighborhood.'],
  ['nia', 'Nia', 'Atlanta, GA', E, ['Singer', 'Songwriter'], ['Soul', 'R&B', 'Hip Hop'], 2, 'Soul singer with a rap heart.', 'Working on a new project. Looking for a producer who vibes with soulful rap and experimental sounds.'],
  ['theo', 'Theo Blaze', 'Philadelphia, PA', E, ['Producer'], ['Hip Hop', 'Soul'], 0, 'Philly soul chops, hard drums.'],
  ['amara', 'Amara', 'Boston, MA', E, ['Singer'], ['Afrobeats', 'R&B'], 1, 'Afro-fusion vocals and harmonies.', 'Looking for an engineer to mix my Afrobeats EP (5 songs).'],
  ['quinn', 'Quinn Rivers', 'Miami, FL', E, ['Producer', 'Engineer'], ['Latin', 'Electronic'], 3, 'Miami bass meets reggaeton.'],
  ['jules', 'Jules Carter', 'Washington, DC', E, ['Rapper'], ['Hip Hop'], 4, 'DMV bars with go-go bounce.'],
  ['kofi', 'Kofi', 'Newark, NJ', E, ['Producer'], ['Afrobeats', 'Hip Hop'], 5, 'Jersey club meets Accra.'],
  ['rae', 'Rae Monét', 'Baltimore, MD', E, ['Singer'], ['Neo-soul', 'R&B'], 2, 'Neo-soul with Baltimore grit.'],
  ['vince', 'Vince Calloway', 'Bronx, NY', E, ['Rapper'], ['Drill', 'Hip Hop'], 0, 'Bronx drill. Studio rat.', 'Need hooks. Singers with an edge, hit me.'],
  ['eden', 'Eden Hart', 'Charlotte, NC', E, ['Singer', 'Songwriter'], ['Pop', 'Gospel'], 1, 'Church-trained voice writing pop records.'],
  ['mo', 'Mo Static', 'Harlem, NY', E, ['Engineer', 'Producer'], ['Hip Hop', 'Jazz'], 3, 'Harlem engineer. Jazz samples, warm mixes.'],
  ['tess', 'Tess Grey', 'Pittsburgh, PA', E, ['Producer', 'DJ'], ['Electronic', 'Alternative'], 5, 'Glitchy electronic production for rappers who like risk.'],
  ['dre', 'Dre Okafor', 'Queens, NY', E, ['Rapper'], ['Hip Hop'], 4, 'Queens storyteller. Boom bap forever.'],
  ['lyric', 'Lyric James', 'Richmond, VA', E, ['Singer'], ['R&B', 'Soul'], 2, 'Silky R&B from the 804.'],
];

// [a, b, title, audio slug?, hoursAgo]
const COLLABS = [
  ['milo', 'saint', 'Same Time', 'same-time', 2],
  ['kai', 'zaya', 'Night Shift', 'night-shift', 26],
  ['theo', 'jules', 'City Lights', 'city-lights', 9],
  ['luna', 'marisol', 'Golden Hour', 'golden-hour', 40],
  ['sol', 'jaylen', 'Low Tide', 'low-tide', 70],
  ['kai', 'milo', 'Westbound'], ['kai', 'saint', 'No Signal'], ['kai', 'saint', 'Halo Effect'],
  ['kai', 'jaylen', 'Overcast'], ['kai', 'luna', 'Sunset Blvd'], ['kai', 'dex', 'Heatwave'], ['kai', 'dex', 'Mirage'],
  ['kai', 'rook', 'Neon Strip'], ['kai', 'sol', 'Altitude'], ['kai', 'tavi', 'Cold Open'], ['kai', 'marisol', 'Paper Hearts'],
  ['kai', 'bree', 'Crenshaw'], ['kai', 'kenji', 'Afterparty'], ['kai', 'theo', 'Coast to Coast'], ['kai', 'jules', 'Capital Gains'],
  ['zaya', 'nia', 'Southern Lights'], ['zaya', 'theo', 'Broad Street'], ['zaya', 'amara', 'Lagos to Brooklyn'], ['zaya', 'quinn', 'Ocean Drive'],
  ['zaya', 'jules', 'Monuments'], ['zaya', 'kofi', 'Ferry'], ['zaya', 'rae', 'Velvet'], ['zaya', 'vince', 'Concrete'],
  ['zaya', 'mo', 'Lenox'], ['zaya', 'dre', 'Seven Train'], ['zaya', 'lyric', 'River City'], ['zaya', 'saint', 'Red Eye'],
  ['jaylen', 'milo', 'Gray Skies'], ['jaylen', 'ivy', 'Evergreen'], ['jaylen', 'noah', 'Tape Hiss'], ['jaylen', 'nia', 'Sweet Tea'],
  ['jaylen', 'kofi', 'Two Timezones'], ['jaylen', 'tess', 'Static Bloom'], ['jaylen', 'luna', 'Puget'],
  ['milo', 'rook', 'Jackpot'], ['milo', 'bree', 'Fruitvale'], ['milo', 'dre', 'Long Distance'],
  ['saint', 'luna', 'Tidal'], ['saint', 'marisol', 'Slow Burn'],
  ['dex', 'rook', 'Dust Devil'], ['dex', 'noah', 'Feedback'], ['kenji', 'marisol', 'Glass House'], ['ivy', 'noah', 'Rosewood'],
  ['nia', 'rae', 'Honey'], ['nia', 'eden', 'Revival'], ['nia', 'theo', 'Peachtree'], ['nia', 'amara', 'Sunday Best'], ['nia', 'lyric', 'Porch Light'],
  ['theo', 'vince', 'Septa'], ['theo', 'kofi', 'Turnpike'], ['theo', 'tess', 'Three Rivers'], ['theo', 'mo', 'Liberty Bell'],
  ['quinn', 'amara', 'Calor'], ['jules', 'dre', 'Beltway'], ['kofi', 'amara', 'Jollof'], ['vince', 'dre', 'Uptown'], ['mo', 'dre', 'Blue Note'],
  ['eden', 'lyric', 'Choir Room'], ['rae', 'lyric', 'Silk'],
];

function seedDemo() {
  const has = db.prepare('SELECT COUNT(*) AS n FROM artists WHERE is_demo = 1').get().n;
  if (has) return false;
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const ids = {};
  tx(() => {
    const ins = db.prepare(`INSERT INTO artists (is_demo, name, city, region, bio, genres, roles, links, open_to_collab, seeking, seeking_at, avatar_style, created_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?)`);
    const seekHours = { nia: 5, dex: 14, ivy: 30, amara: 50, vince: 90 };
    ARTISTS.forEach(([key, name, city, region, roles, genres, style, bio, seeking], i) => {
      const open = !['tavi', 'mo'].includes(key) ? 1 : 0;
      const r = ins.run(name, city, region, bio, JSON.stringify(genres), JSON.stringify(roles), open, seeking || '', seeking ? ago(seekHours[key] || 24) : null, style, ago(24 * 60 - i));
      ids[key] = Number(r.lastInsertRowid);
    });
    const insT = db.prepare(`INSERT INTO tracks (title, title_key, submitter_id, partner_id, pair_lo, pair_hi, audio_url, status, is_demo, created_at, responded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 1, ?, ?)`);
    COLLABS.forEach(([a, b, title, audio, hours], i) => {
      const s = ids[a], p = ids[b];
      const h = hours ?? 80 + i * 9;
      insT.run(title, titleKey(title), s, p, Math.min(s, p), Math.max(s, p), audio ? `/media/demo/${audio}.mp3` : null, ago(h + 20), ago(h));
    });
  });
  return true;
}

module.exports = { seedDemo };
