// Zero Form brag, take 4 (staff workload): 34s, 120 BPM. D minor "paperwork" (0-9s) lifts to F major at the reveal.
// Music and SFX are one piece on one grid (8ths = 0.25s, 16ths = 0.125s), every cue taken from video.html.
import fs from 'node:fs';
import path from 'node:path';

const SR = 48000, DUR = 34, N = SR * DUR, BEAT = 0.5;
const L = new Float32Array(N), R = new Float32Array(N), RL = new Float32Array(N), RR = new Float32Array(N);
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
function add(t0, len, fn, gain, pan = 0, send = 0.25) {
  const s0 = Math.round(t0 * SR), n = Math.min(Math.round(len * SR), N - s0);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n; i++) { const v = fn(i / SR), j = s0 + i; L[j] += v * gl; R[j] += v * gr; RL[j] += v * gl * send; RR[j] += v * gr * send; }
}
const env = (t, a, len, r) => (t < a ? t / a : 1) * (t > len - r ? Math.max(0, (len - t) / r) : 1);

// --- instruments ---
const pad = (m, t0, len, g, pan) => { const f = hz(m); add(t0, len + 0.8, (t) => { let v = 0; for (const d of [0.997, 1.003]) for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * f * d * k * t + k) / Math.pow(k, 1.8); return v * 0.5 * env(t, 0.35, len + 0.8, 0.9); }, g, pan, 0.5); };
const pluck = (m, t0, g, pan = 0, send = 0.35, dec = 5) => { const f = hz(m); add(t0, 1.6, (t) => { let v = 0; for (let k = 1; k <= 6; k++) v += Math.sin(2 * Math.PI * f * k * t) * Math.exp(-t * (dec + k * 3)) / k; return v * Math.min(1, t * 400); }, g, pan, send); };
const bell = (m, t0, g, pan = 0) => { const f = hz(m); add(t0, 3, (t) => (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6) + 0.35 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 2.6) + 0.12 * Math.sin(6 * Math.PI * f * t) * Math.exp(-t * 4.5)) * Math.min(1, t * 300), g, pan, 0.6); };
const bass = (m, t0, len, g) => { const f = hz(m); add(t0, len, (t) => (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t * 200) * Math.exp(-t * 1.2) * env(t, 0.005, len, 0.08), g, 0, 0.05); };
const kick = (t0, g) => add(t0, 0.4, (t) => Math.sin(2 * Math.PI * (45 * t + (75 / 18) * (1 - Math.exp(-t * 18)))) * Math.exp(-t * 9) * Math.min(1, t * 1000), g, 0, 0.02);
const hat = (t0, g, pan) => { let lp = 0; add(t0, 0.08, (t) => { const n = rnd(), hp = n - lp; lp = n; return hp * Math.exp(-t * 70); }, g, pan, 0.15); };
const tick = (t0, g, m, pan = 0.15) => { let lp = 0; add(t0, 0.08, (t) => { const n = rnd(); lp += 0.35 * (n - lp); return (lp * 0.6 + 0.4 * Math.sin(2 * Math.PI * hz(m) * t)) * Math.exp(-t * 55); }, g, pan, 0.2); };
const swell = (t0, len, g) => { let lp = 0; add(t0, len, (t) => { const c = 0.01 + 0.25 * Math.pow(t / len, 2); lp += c * (rnd() - lp); return lp * Math.pow(t / len, 2); }, g, 0, 0.6); };
const swish = (t0, g) => { let lp = 0; add(t0, 0.3, (t) => { lp += 0.2 * (rnd() - lp); return lp * Math.sin(Math.PI * t / 0.3); }, g, 0.2, 0.3); };

// --- harmony: [start, len, voicing, bass root] ---
const Dm = [[50, 57, 60, 65], 38], Bb = [[50, 53, 58, 62], 34], Gm = [[50, 55, 58, 62], 31], A = [[49, 52, 57, 61], 33];
const F = [[53, 57, 60, 64], 41], Dm2 = [[50, 57, 60, 65], 38], C = [[52, 55, 60, 64], 36], Fend = [[53, 57, 60, 64, 69], 41];
const SONG = [[0, 2, Dm], [2, 2, Bb], [4, 2, Gm], [6, 3, A],
  [9, 2, F], [11, 2, Dm2], [13, 2, Bb], [15, 2, C], [17, 2, F], [19, 2, Dm2], [21, 2, Bb], [23, 2, C], [25, 2, F], [27, 2, Dm2], [29, 1.5, Bb], [30.5, 3.5, Fend]];
for (const [t0, len, [v, root]] of SONG) {
  const minor = t0 < 9;
  v.forEach((m, i) => pad(m, t0, len, minor ? 0.05 : 0.065, (i / (v.length - 1)) * 1.2 - 0.6));
  if (t0 >= 9 && t0 < 30.5) for (let b = 0; b * BEAT < len; b++) bass(root, t0 + b * BEAT, BEAT * 0.95, t0 < 12.5 ? 0.14 : 0.2);
  if (t0 >= 30.5) bass(root, t0, 3.5, 0.2);
  if (minor) bass(root, t0, len, 0.12); // one long low note per chord: weight without groove
  // 8th-note arpeggio while the officer console works (17-30.5)
  if (t0 >= 17 && t0 < 30.5) { const arp = v.map((m) => m + 12), pat = [0, 1, 2, 3, 2, 1, 2, 3]; for (let k = 0; k * 0.25 < len; k++) pluck(arp[pat[k % 8]], t0 + k * 0.25, 0.04, k % 2 ? 0.35 : -0.35, 0.4, 7); }
}

// --- rhythm ---
for (let t = 3.0; t < 8.9; t += 0.25) tick(t, t % 0.5 ? 0.035 : 0.055, 88, 0.25); // paperwork clock
for (let t = 12.5; t < 30.5; t += BEAT) kick(t, 0.28);
kick(30.5, 0.3);
for (let t = 13.25; t < 30.5; t += BEAT) hat(t, 0.04, 0.3);

// --- SFX, in key, on the grid ---
[62, 64, 65, 67, 69, 70, 72, 74, 76, 77].forEach((m, i) => pluck(m - 12, 0.5 + i * 0.125, 0.11, (i - 4.5) * 0.12, 0.35, 6)); // 10 documents land (D minor)
[[3.5, 69], [5.0, 65], [6.5, 62]].forEach(([t, m]) => { bell(m, t, 0.07, 0); pluck(m - 12, t, 0.06); });   // each fact spotlit
swell(7.0, 1.0, 0.16); [57, 61, 64, 67].forEach((m, i) => pluck(m, 8.0 + i * 0.0625, 0.05, (i - 1.5) * 0.3)); // all 42 blanks lit
swell(8.0, 1.0, 0.14);
[77, 84].forEach((m, i) => bell(m, 9.0 + i * 0.25, 0.09));                                // reveal chime
tick(13.5, 0.12, 84, 0);                                                                  // click: run self-review
[69, 65].forEach((m, i) => bell(m, 14.0 + i * 0.25, 0.08, 0.1));                          // caught: soft falling 3rd
pluck(57, 14.5, 0.07, 0);                                                                 // ring
[72, 76, 79, 84].forEach((m, i) => bell(m, 16.75 + i * 0.125, 0.05, (i - 1.5) * 0.25));   // 12/12 passed (C major)
tick(18.0, 0.12, 84, 0);                                                                  // click: sign
[65, 69, 72, 77, 81].forEach((m, i) => pluck(m + 12, 19.0 + i * 0.25, 0.06, (i - 2) * 0.2, 0.4, 7)); // 5 checks pop
pluck(84, 20.25, 0.05, 0.3);                                                              // evidence 12/12
swish(20.75, 0.06); pluck(77, 21.625, 0.05); swish(22.25, 0.05);                          // scroll down, 7/7 documents, back up
tick(23.5, 0.12, 84, 0); [65, 69, 72, 77].forEach((m, i) => bell(m + 12, 23.5 + i * 0.0625, 0.06, (i - 1.5) * 0.25)); // approve
[26.0, 26.5, 27.0].forEach((t, i) => { pluck([72, 74, 76][i], t, 0.06, 0); swish(t + 0.5, 0.04); pluck([77, 79, 81][i], t + 0.5, 0.05, 0.2); }); // rows + strikes
swell(29.5, 1.0, 0.15);
[65, 72, 77, 81].forEach((m, i) => bell(m + 12, 30.5 + i * 0.125, 0.07, (i - 1.5) * 0.25)); // outro

// --- reverb (Schroeder) ---
function reverb(x, off) {
  const y = new Float32Array(N);
  for (const [d, fb] of [[1557, .82], [1617, .81], [1491, .83], [1422, .8]].map(([d, f]) => [Math.round(d * SR / 44100) + off, f])) {
    const buf = new Float32Array(d); let k = 0, lp = 0;
    for (let i = 0; i < N; i++) { const o = buf[k]; lp = o * 0.7 + lp * 0.3; buf[k] = x[i] + lp * fb; k = (k + 1) % d; y[i] += o * 0.25; }
  }
  for (const d of [Math.round(556 * SR / 44100) + off, Math.round(225 * SR / 44100)]) {
    const buf = new Float32Array(d); let k = 0;
    for (let i = 0; i < N; i++) { const b = buf[k], v = -0.5 * y[i] + b; buf[k] = y[i] + 0.5 * b; y[i] = v; k = (k + 1) % d; }
  }
  return y;
}
const wl = reverb(RL, 0), wr = reverb(RR, 23);
let peak = 0; const out = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / 0.02) * (t > 32.4 ? Math.max(0, (34 - t) / 1.6) : 1);
  const l = Math.tanh((L[i] + wl[i] * 0.55) * 1.1) * fade, r = Math.tanh((R[i] + wr[i] * 0.55) * 1.1) * fade;
  out[2 * i] = l; out[2 * i + 1] = r; peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const g = 0.89 / peak, pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N * 2; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * g)) * 32767), 44 + i * 2);
const file = path.join(path.dirname(new URL(import.meta.url).pathname), 'music.wav');
fs.writeFileSync(file, pcm); console.log('wrote', file, 'peak gain', g.toFixed(2));
