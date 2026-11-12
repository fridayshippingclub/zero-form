# Launch video

A 30-second 16:9 launch spot for Zero Form, made with [raea](https://raea.io) (React compositions rendered on the GPU).
The finished share copy is [`demo/zero-form-launch.mp4`](../demo/zero-form-launch.mp4).

Every screen comes from the end-to-end recording (`demo/zero-form-final.mp4`), and every number comes from the main README.
The music is a soft grand piano (VCSL Steinway B, CC0), written in Tone.js in `edit.tsx`.

| Time | Scene | Source |
| --- | --- | --- |
| 0–2.7 s | 7 official forms | recording 2.0 s |
| 2.7–6.7 s | 47 fields → 11 facts → 3 for you to type | built |
| 6.7–12 s | Every form fills in as you type | recording 40.0 s |
| 12–16 s | Confirm once. Get all 7 PDFs | recording 65.0 s, 68.4 s |
| 16–21.3 s | Filled onto the official forms | recording 131.4 s, 142.6 s |
| 21.3–25.3 s | Tampering shows up in red | recording 173.8 s |
| 25.3–30.7 s | Logo, line, repository link | `assets/brand/logo-light.svg` |

## Rebuild

```sh
cd launch
mkdir -p media/footage && cp ../demo/zero-form-final.mp4 media/footage/demo.mp4
raea sounds get vcsl/grand-piano-steinway-b --notes C2,C3,G3,C4,E4,G4,C5
raea check edit.tsx --quick --shape 16:9
raea render edit.tsx -o out/zero-form-launch.mp4 --manifest out/render.json --quality master
raea check out/zero-form-launch.mp4 --manifest out/render.json --shape 16:9
```

Last check: 0 errors. It measured −14.1 LUFS with a −1.6 dBTP true peak. All 17 texts fit, stay out of the safe zones, meet 3:1 contrast and stay on screen long enough to read. raea warns once because `brand/brand.css` was written by hand from `assets/brand/README.md` instead of read from a website.
