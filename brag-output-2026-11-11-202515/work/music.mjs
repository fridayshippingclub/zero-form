// Zero Form brag soundtrack: 20s, 120 BPM, F major. Music + SFX written as one piece on one grid.
import fs from 'node:fs';
import path from 'node:path';

const SR = 48000, DUR = 28, N = SR * DUR, BEAT = 0.5;
const L = new Float32Array(N), R = new Float32Array(N);       // dry
const RL = new Float32Array(N), RR = new Float32Array(N);     // reverb send
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function add(t0, len, fn, gain, pan = 0, send = 0.25) {
  const s0 = Math.round(t0 * SR), n = Math.min(Math.round(len * SR), N - s0);
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n; i++) {
    const v = fn(i / SR); const j = s0 + i;
    L[j] += v * gl; R[j] += v * gr; RL[j] += v * gl * send; RR[j] += v * gr * send;
  }
}
const env = (t, a, len, r) => (t < a ? t / a : 1) * (t > len - r ? Math.max(0, (len - t) / r) : 1);

// --- instruments ---
const padNote = (m, t0, len, g, pan) => {
  const f = hz(m), det = [0.997, 1.003];
  add(t0, len + 0.8, (t) => {
    let v = 0; for (const d of det) for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * f * d * k * t + k) / Math.pow(k, 1.8);
    return v * 0.5 * env(t, 0.35, len + 0.8, 0.9);
  }, g, pan, 0.5);
};
const pluck = (m, t0, g, pan = 0, send = 0.35, dec = 4) => {
  const f = hz(m);
  add(t0, 1.6, (t) => {
    let v = 0; for (let k = 1; k <= 6; k++) v += Math.sin(2 * Math.PI * f * k * t) * Math.exp(-t * (dec + k * 3)) / k;
    return v * Math.min(1, t * 400);
  }, g, pan, send);
};
const bell = (m, t0, g, pan = 0) => {
  const f = hz(m);
  add(t0, 3, (t) => (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1.6)
    + 0.35 * Math.sin(2 * Math.PI * f * 2.0 * t) * Math.exp(-t * 2.6)
    + 0.12 * Math.sin(2 * Math.PI * f * 3.0 * t) * Math.exp(-t * 4.5)) * Math.min(1, t * 300), g, pan, 0.6);
};
const bass = (m, t0, len, g) => {
  const f = hz(m);
  add(t0, len, (t) => (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t * 200) * Math.exp(-t * 1.2) * env(t, 0.005, len, 0.08), g, 0, 0.05);
};
const kick = (t0, g) => add(t0, 0.4, (t) => Math.sin(2 * Math.PI * (45 * t + (75 / 18) * (1 - Math.exp(-t * 18)))) * Math.exp(-t * 9) * Math.min(1, t * 1000), g, 0, 0.02);
const hat = (t0, g, pan) => { let lp = 0; add(t0, 0.08, (t) => { const n = rnd(); const hp = n - lp; lp = n; return hp * Math.exp(-t * 70); }, g, pan, 0.15); };
const tick = (t0, g, m) => { let lp = 0; add(t0, 0.08, (t) => { const n = rnd(); lp += 0.35 * (n - lp); return (lp * 0.6 + 0.4 * Math.sin(2 * Math.PI * hz(m) * t)) * Math.exp(-t * 55); }, g, 0.15, 0.2); };
const swell = (t0, len, g) => { let lp = 0; add(t0, len, (t) => { const c = 0.01 + 0.25 * Math.pow(t / len, 2); lp += c * (rnd() - lp); return lp * Math.pow(t / len, 2); }, g, 0, 0.6); };

// --- harmony: one chord per bar (2s). D minor for the problem, F major from the reveal (10.0s) ---
const V = { Dm: [[50, 57, 60, 65], 38], Bb: [[50, 53, 58, 62], 34], Gm: [[50, 55, 58, 62], 43], A: [[49, 52, 57, 64], 45], Asus: [[50, 52, 57, 64], 45],
  F: [[53, 57, 60, 64], 41], C: [[52, 55, 60, 64], 36] };
const BARS = ['Dm', 'Bb', 'Gm', 'A', 'Asus', 'F', 'Dm', 'Bb', 'C', 'F', 'Bb', 'C', 'F'];
BARS.forEach((name, bar) => {
  const [v, root] = V[name], t0 = bar * 2, outro = bar === 12, minor = bar < 5;
  v.forEach((m, i) => padNote(m, t0, outro ? 4 : 2, minor ? 0.045 : 0.065, (i / (v.length - 1)) * 1.2 - 0.6));
  if (minor) { bass(root, t0, 0.95, 0.16); bass(root, t0 + 1, 0.95, 0.12); }        // slow, heavy pulse
  else if (!outro) for (let b = 0; b < 4; b++) bass(root, t0 + b * BEAT, BEAT * 0.95, 0.22);
  else bass(root, t0, 4, 0.22);
  if (!minor && !outro) {
    const arp = v.map((m) => m + 12), pat = [0, 1, 2, 3, 2, 1, 2, 3];
    pat.forEach((p, k) => pluck(arp[p], t0 + k * 0.25, 0.05, k % 2 ? 0.35 : -0.35, 0.4, 6));
  }
});
// problem section: a dry clock tick on every beat (the tedium of retyping)
for (let t = 0.5; t < 9.5; t += BEAT) tick(t, 0.05, 81);

// --- drums from the reveal: soft four-on-the-floor 10–24, off-beat hats 13–24 ---
for (let t = 10.0; t < 24.0; t += BEAT) kick(t, 0.3);
kick(24.0, 0.3);
for (let t = 13.25; t < 24.0; t += BEAT) hat(t, 0.045, 0.3);

// --- SFX on the grid ---
[62, 64, 65, 67, 69, 70, 72].forEach((m, i) => pluck(m, 0.375 + i * 0.125, 0.08, (i - 3) * 0.15, 0.3, 7)); // forms land (D minor)
[[1.5, 81], [3.0, 82], [4.5, 79]].forEach(([t, m]) => { bell(m, t, 0.06); pluck(m - 12, t, 0.07, 0, 0.3, 5); }); // duplicates light up
pluck(45, 6.0, 0.12, 0, 0.2, 3);                                               // close-up
[[45, 0.14], [52, 0.08]].forEach(([m, g]) => pluck(m, 7.5, g, 0, 0.3, 3));      // the typo: low, muted
bell(76, 7.5, 0.06); bell(73, 7.75, 0.045);                                     // ...and a falling two-note "wrong"
swell(9.0, 1.0, 0.18);
[77, 84].forEach((m, i) => bell(m, 10.0 + i * 0.25, 0.10));                      // reveal chime, now in F major
[72, 74, 77, 79, 81].forEach((m, i) => pluck(m, 13.5 + i * 0.25, 0.05, (i - 2) * 0.2, 0.4, 8)); // verified facts tick in
for (let i = 0; i < 7; i++) tick(16.0 + i * 0.25, 0.10, 84);                    // typing
[77, 81, 84, 86, 89].forEach((m, i) => pluck(m, 20.0 + i * 0.25, 0.045, (i - 2) * 0.2, 0.4, 8)); // officer checks go green
pluck(72, 23.0, 0.08, 0, 0.3, 7); [72, 76, 79].forEach((m, i) => bell(m + 12, 23.0 + i * 0.125, 0.06, (i - 1) * 0.3)); // Approve
swell(23.0, 1.0, 0.14);
[65, 72, 77, 81].forEach((m, i) => bell(m + 12, 24.0 + i * 0.125, 0.07, (i - 1.5) * 0.25)); // outro

// --- reverb: Schroeder (4 combs + 2 allpass) per channel ---
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

// --- master: sum, fades, soft clip, normalize ---
let peak = 0; const out = new Float32Array(N * 2);
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = Math.min(1, t / 0.02) * (t > 26.6 ? Math.max(0, (28 - t) / 1.4) : 1);
  const l = Math.tanh((L[i] + wl[i] * 0.55) * 1.1) * fade, r = Math.tanh((R[i] + wr[i] * 0.55) * 1.1) * fade;
  out[2 * i] = l; out[2 * i + 1] = r; peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const g = 0.89 / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N * 2; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * g)) * 32767), 44 + i * 2);
const file = path.join(path.dirname(new URL(import.meta.url).pathname), 'music.wav');
fs.writeFileSync(file, pcm); console.log('wrote', file, 'peak gain', g.toFixed(2));
