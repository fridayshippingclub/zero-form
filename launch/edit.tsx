// Zero Form launch spot, 30 s, 16:9. Every screen is the recorded end-to-end demo (media/footage/demo.mp4,
// = demo/zero-form-final.mp4); every number is from README.md. Scenes cut on the piano bed's beats (90 BPM).
import { AbsoluteFill, Composition, Easing, Img, Mix, Sequence, Video, interpolate, registerRoot, staticFile, useCurrentFrame, useVideoConfig } from "raea";
import * as Tone from "raea/tone";
import { css } from "./styles.gen";

const FPS = 30;
const W = 1920;
const H = 1080;
const DEMO = staticFile("footage/demo.mp4");
const SRC = { w: 1440, h: 900 };

const OUT = Easing.out(Easing.cubic);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ── the bed: a soft grand piano (VCSL Steinway B, CC0), broken chords, one bar per 80 frames ──────────────────
const piano = new Tone.Sampler({
  urls: {
    C2: staticFile("sounds/vcsl-grand-piano-steinway-b/C2.wav"),
    C3: staticFile("sounds/vcsl-grand-piano-steinway-b/C3.wav"),
    "F#3": staticFile("sounds/vcsl-grand-piano-steinway-b/Fs3.wav"),
    C4: staticFile("sounds/vcsl-grand-piano-steinway-b/C4.wav"),
    E4: staticFile("sounds/vcsl-grand-piano-steinway-b/E4.wav"),
    "F#4": staticFile("sounds/vcsl-grand-piano-steinway-b/Fs4.wav"),
    C5: staticFile("sounds/vcsl-grand-piano-steinway-b/C5.wav"),
  },
  release: 1.6,
});
const soften = new Tone.Filter({ type: "lowpass", frequency: 3200, rolloff: -24 });
const verb = new Tone.Reverb({ decay: 5, wet: 0.32 });
piano.chain(soften, verb, Tone.buses.music);

const BEAT = 60 / 90;
const BAR = 4 * BEAT; // 2.667 s = 80 frames
const C = { bass: "C2", tones: ["E4", "G4", "C5"] };
const Am = { bass: "A1", tones: ["E4", "A4", "C5"] };
const F = { bass: "F1", tones: ["F4", "A4", "C5"] };
const G = { bass: "G1", tones: ["D4", "G4", "B4"] };
const PROG = [C, Am, F, G, C, Am, F, G, F, G];
const ARP = [0, 1, 2, 1, 0, 1, 2, 1];
type Note = { time: number; note: string | string[]; dur: number; vel: number };
const notes: Note[] = [];
PROG.forEach((ch, bar) => {
  const t0 = bar * BAR;
  notes.push({ time: t0, note: [ch.bass, ch.bass.replace(/\d/, (d) => String(Number(d) + 1))], dur: BAR, vel: 0.42 });
  ARP.forEach((i, k) => notes.push({ time: t0 + k * (BEAT / 2), note: ch.tones[i], dur: BEAT, vel: k === 0 ? 0.3 : 0.2 }));
});
// the end card lands on the home chord, left to ring
notes.push({ time: PROG.length * BAR, note: ["C2", "C3", "E4", "G4", "C5"], dur: 4, vel: 0.4 });
new Tone.Part((t, n: Note) => piano.triggerAttackRelease(n.note, n.dur, t, n.vel), notes.map((n) => [n.time, n])).start(0);
Tone.getTransport().start();

// ── parts ──────────────────────────────────────────────────────────────────────────────────────────────────
const font = { fontFamily: "var(--brand-font-heading)" } as const;

function Line({ text, top, size = "h2", color = "var(--brand-text)", delay = 0, rise = true }: {
  text: string; top: number; size?: "h1" | "h2" | "p"; color?: string; delay?: number; rise?: boolean;
}) {
  const f = useCurrentFrame() - delay;
  const opacity = rise ? interpolate(f, [0, 7], [0, 1], clamp) : 1;
  const y = rise ? interpolate(f, [0, 10], [28, 0], { ...clamp, easing: OUT }) : 0;
  return (
    <div style={{
      ...font, position: "absolute", left: 120, right: 120, top, textAlign: "center",
      fontSize: `var(--brand-${size}-size)`, fontWeight: `var(--brand-${size}-weight)` as never,
      lineHeight: `var(--brand-${size}-line)`, letterSpacing: size === "p" ? "-0.01em" : `var(--brand-${size}-tracking)`,
      color, opacity, transform: `translateY(${y}px)`,
    }}>{text}</div>
  );
}

type Crop = { x: number; y: number; w: number; h: number }; // fractions of the 1440x900 recording

/** A stretch of the demo recording, cropped to the part that matters, as a card that keeps drifting closer. */
function Shot({ at, frames, crop, width, top, push = 0.035, origin = "50% 40%" }: {
  at: number; frames: number; crop: Crop; width: number; top: number; push?: number; origin?: string;
}) {
  const f = useCurrentFrame();
  const s = width / (crop.w * SRC.w);
  const height = Math.round(crop.h * SRC.h * s);
  const z = interpolate(f, [0, frames], [1, 1 + push], clamp);
  const start = Math.round(at * FPS);
  return (
    <div style={{
      position: "absolute", left: (W - width) / 2, top, width, height, overflow: "hidden",
      borderRadius: "var(--brand-radius)", boxShadow: "var(--brand-shadow-lg)", backgroundColor: "var(--brand-surface)",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height, transform: `scale(${z})`, transformOrigin: origin }}>
        <Video src={DEMO} muted startFrom={start} endAt={start + frames + 1} style={{
          position: "absolute", left: -crop.x * SRC.w * s, top: -crop.y * SRC.h * s,
          width: SRC.w * s, height: SRC.h * s, maxWidth: "none", maxHeight: "none", objectFit: "fill",
        }} />
      </div>
    </div>
  );
}

// ── scenes ─────────────────────────────────────────────────────────────────────────────────────────────────

function Hook() {
  return (
    <AbsoluteFill>
      <Line text="7 official forms." top={170} size="h1" rise={false} />
      <Line text="to start one company in Taipei." top={330} size="p" color="var(--brand-color-4)" delay={10} />
      <Shot at={2.0} frames={80} crop={{ x: 0.008, y: 0.43, w: 0.984, h: 0.31 }} width={1680} top={500} push={0.05} />
    </AbsoluteFill>
  );
}

function Num({ n, label, at, x, accent }: { n: string; label: string; at: number; x: number; accent?: boolean }) {
  const f = useCurrentFrame() - at;
  const opacity = interpolate(f, [0, 6], [0, 1], clamp);
  const scale = interpolate(f, [0, 12], [0.86, 1], { ...clamp, easing: OUT });
  return (
    <div style={{ ...font, position: "absolute", left: x - 260, width: 520, top: 230, textAlign: "center", opacity, transform: `scale(${scale})` }}>
      <div style={{ fontSize: "var(--brand-num-size)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1, color: accent ? "var(--brand-accent)" : "var(--brand-text)" }}>{n}</div>
      <div style={{ fontSize: "var(--brand-p-size)", fontWeight: 600, marginTop: 18, color: accent ? "var(--brand-accent)" : "var(--brand-color-4)" }}>{label}</div>
    </div>
  );
}

function Arrow({ at, x }: { at: number; x: number }) {
  const f = useCurrentFrame() - at;
  const opacity = interpolate(f, [0, 6], [0, 1], clamp);
  const dx = interpolate(f, [0, 10], [-24, 0], { ...clamp, easing: OUT });
  return <div style={{ ...font, position: "absolute", left: x - 60, width: 120, top: 300, textAlign: "center", fontSize: 120, fontWeight: 400, color: "var(--brand-color-4)", opacity, transform: `translateX(${dx}px)` }}>→</div>;
}

function Merge() {
  return (
    <AbsoluteFill>
      <Num n="47" label="fields on 7 forms" at={0} x={420} />
      <Arrow at={16} x={720} />
      <Num n="11" label="different facts" at={20} x={960} />
      <Arrow at={36} x={1200} />
      <Num n="3" label="for you to type" at={40} x={1500} accent />
      <Line text="The rest comes from verified records." top={760} size="p" delay={62} />
    </AbsoluteFill>
  );
}

function Proof({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <AbsoluteFill>
      {children}
      <Line text={title} top={140} size="h2" />
    </AbsoluteFill>
  );
}

function EndCard() {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 12], [0, 1], clamp);
  const scale = interpolate(f, [0, 160], [0.97, 1.02], clamp);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: (W - 960) / 2, top: 300, width: 960, opacity, transform: `scale(${scale})` }}>
        <Img src={staticFile("brand/logo-light.png")} style={{ width: 960, height: 205 }} />
      </div>
      <Line text="Answer once. Sign once. Get every form." top={600} size="p" delay={14} />
      <Line text="github.com/fridayshippingclub/zero-form" top={760} size="p" color="var(--brand-accent)" delay={26} />
    </AbsoluteFill>
  );
}

// ── the edit ───────────────────────────────────────────────────────────────────────────────────────────────
const SCENES = [
  { name: "hook: 7 forms", from: 0, len: 80 },
  { name: "47 → 11 → 3", from: 80, len: 120 },
  { name: "proof: fills as you type", from: 200, len: 160 },
  { name: "proof: sign, 7 PDFs", from: 360, len: 120 },
  { name: "proof: official forms filled", from: 480, len: 160 },
  { name: "proof: tamper turns red", from: 640, len: 120 },
  { name: "end card", from: 760, len: 160 },
];
const TOTAL = 920;

function Launch() {
  const s = (i: number) => ({ from: SCENES[i].from, durationInFrames: SCENES[i].len, name: SCENES[i].name });
  return (
    <AbsoluteFill style={{ backgroundColor: "var(--brand-background)" }}>
      <style>{css}</style>
      <Sequence {...s(0)}><Hook /></Sequence>
      <Sequence {...s(1)}><Merge /></Sequence>
      <Sequence {...s(2)}>
        <Proof title="Every form fills in as you type.">
          <Shot at={40.0} frames={160} crop={{ x: 0.245, y: 0.085, w: 0.745, h: 0.54 }} width={1500} top={300} push={0.04} origin="30% 40%" />
        </Proof>
      </Sequence>
      <Sequence {...s(3)}>
        <Proof title="Confirm once. Get all 7 PDFs.">
          <Sequence from={0} durationInFrames={44} name="generating">
            <Shot at={65.0} frames={44} crop={{ x: 0.36, y: 0.09, w: 0.5, h: 0.42 }} width={1060} top={300} push={0.03} origin="20% 50%" />
          </Sequence>
          <Sequence from={44} durationInFrames={76} name="7 pdfs">
            <Shot at={68.4} frames={76} crop={{ x: 0.36, y: 0.165, w: 0.5, h: 0.655 }} width={860} top={300} push={0.03} origin="50% 70%" />
          </Sequence>
        </Proof>
      </Sequence>
      <Sequence {...s(4)}>
        <Proof title="Filled onto the official forms.">
          <Sequence from={0} durationInFrames={110} name="registration form">
            <Shot at={131.4} frames={110} crop={{ x: 0, y: 0.1, w: 1, h: 0.74 }} width={1500} top={300} push={0.06} origin="30% 45%" />
          </Sequence>
          <Sequence from={110} durationInFrames={50} name="name reservation">
            <Shot at={142.6} frames={50} crop={{ x: 0.03, y: 0.1, w: 0.97, h: 0.72 }} width={1500} top={300} push={0.03} origin="30% 50%" />
          </Sequence>
        </Proof>
      </Sequence>
      <Sequence {...s(5)}>
        <Proof title="Tampering shows up in red.">
          <Shot at={173.8} frames={120} crop={{ x: 0, y: 0.04, w: 0.72, h: 0.6 }} width={1300} top={300} push={0.04} origin="25% 45%" />
        </Proof>
      </Sequence>
      <Sequence {...s(6)}><EndCard /></Sequence>
      <Mix lufs={-14} ceiling={-1.5} />
    </AbsoluteFill>
  );
}

registerRoot(() => <Composition id="launch" component={Launch} width={W} height={H} fps={FPS} durationInFrames={TOTAL} />);
