// Synthesizes short original instrumental loops for the demo tracks.
// Output: public/media/demo/<slug>.mp3 (requires ffmpeg on PATH).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SR = 32000;
const OUT = path.join(__dirname, '..', 'public', 'media', 'demo');

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const TRACKS = [
  { slug: 'night-shift', bpm: 88, root: 45, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-7, -3, 0, 3]], kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.xxx.', seed: 7, pad: 0.16, swing: 0.08 },
  { slug: 'same-time', bpm: 92, root: 48, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]], kick: 'x......x..x.....', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', seed: 11, pad: 0.14, swing: 0.12 },
  { slug: 'golden-hour', bpm: 100, root: 50, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [-3, 0, 4, 7], [2, 5, 9, 12]], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', seed: 23, pad: 0.13, swing: 0 },
  { slug: 'city-lights', bpm: 84, root: 43, chords: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [-2, 2, 5, 8]], kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', seed: 31, pad: 0.17, swing: 0.1 },
  { slug: 'low-tide', bpm: 76, root: 41, chords: [[0, 3, 7, 10, 14], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -2, 2, 5]], kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x...x...x...x...', seed: 47, pad: 0.2, swing: 0.15 },
];

function render(t) {
  const rand = rng(t.seed);
  const step = 60 / t.bpm / 4; // 16th note
  const bars = 8;
  const total = Math.ceil(bars * 16 * step * SR) + SR;
  const L = new Float32Array(total);
  const add = (i, v) => { if (i >= 0 && i < total) L[i] += v; };

  for (let bar = 0; bar < bars; bar++) {
    const chord = t.chords[bar % t.chords.length];
    const barStart = bar * 16 * step;
    // pad: detuned saws through a one-pole lowpass
    const padLen = 16 * step;
    for (const n of chord) {
      for (const det of [-0.08, 0.08]) {
        const f = midi(t.root + 12 + n + det);
        let lp = 0, ph = rand();
        const s0 = Math.floor(barStart * SR);
        const len = Math.floor(padLen * SR);
        for (let i = 0; i < len; i++) {
          ph += f / SR; ph -= Math.floor(ph);
          const saw = 2 * ph - 1;
          lp += 0.04 * (saw - lp);
          const env = Math.min(1, i / (SR * 0.25)) * Math.min(1, (len - i) / (SR * 0.2));
          add(s0 + i, lp * env * t.pad / chord.length);
        }
      }
    }
    for (let s = 0; s < 16; s++) {
      const sw = s % 2 ? t.swing * step : 0;
      const at = Math.floor((barStart + s * step + sw) * SR);
      const fill = bar % 4 === 3 && s >= 12;
      // kick
      if (t.kick[s] === 'x' || (fill && s === 14)) {
        let ph = 0;
        for (let i = 0; i < SR * 0.45; i++) {
          const tt = i / SR;
          const f = 45 + 95 * Math.exp(-tt * 28);
          ph += f / SR;
          add(at + i, Math.sin(2 * Math.PI * ph) * Math.exp(-tt * 7) * 0.85);
        }
      }
      // snare / clap
      if (t.snare[s] === 'x' || (fill && s === 15)) {
        for (let i = 0; i < SR * 0.22; i++) {
          const tt = i / SR;
          const noise = (rand() * 2 - 1) * Math.exp(-tt * 18) * 0.35;
          const tone = Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt * 30) * 0.25;
          add(at + i, noise + tone);
        }
      }
      // hats: differentiated noise ≈ highpass
      if (t.hat[s] === 'x') {
        let prev = 0;
        const vel = s % 4 === 0 ? 0.14 : 0.08;
        for (let i = 0; i < SR * 0.05; i++) {
          const n = rand() * 2 - 1;
          add(at + i, (n - prev) * Math.exp(-i / SR * 70) * vel);
          prev = n;
        }
      }
      // bass on kicks, following chord root
      if (t.kick[s] === 'x') {
        const f = midi(t.root - 12 + chord[0]);
        const len = SR * step * 3;
        for (let i = 0; i < len; i++) {
          const tt = i / SR;
          const v = Math.tanh(1.6 * Math.sin(2 * Math.PI * f * tt)) * 0.3;
          add(at + i, v * Math.min(1, i / 80) * Math.min(1, (len - i) / 400));
        }
      }
    }
    // a simple melodic pluck every other beat
    for (let b = 0; b < 4; b++) {
      if (rand() < 0.45) continue;
      const n = chord[Math.floor(rand() * chord.length)] + 24;
      const f = midi(t.root + n);
      const at = Math.floor((barStart + (b * 4 + (rand() < 0.5 ? 2 : 0)) * step) * SR);
      for (let i = 0; i < SR * 0.6; i++) {
        const tt = i / SR;
        add(at + i, (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt)) * Math.exp(-tt * 6) * 0.09);
      }
    }
  }
  // master: soft clip + fades
  const fadeIn = SR * 0.05, fadeOut = SR * 1.5;
  const used = Math.floor(bars * 16 * step * SR + SR * 0.5);
  const pcm = Buffer.alloc(used * 2);
  for (let i = 0; i < used; i++) {
    let v = Math.tanh(L[i] * 1.1) * 0.9;
    v *= Math.min(1, i / fadeIn) * Math.min(1, (used - i) / fadeOut);
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  return pcm;
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const t of TRACKS) {
  const tmp = path.join(OUT, `${t.slug}.wav`);
  fs.writeFileSync(tmp, wav(render(t)));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '96k', path.join(OUT, `${t.slug}.mp3`)]);
  fs.unlinkSync(tmp);
  console.log('wrote', t.slug + '.mp3');
}
