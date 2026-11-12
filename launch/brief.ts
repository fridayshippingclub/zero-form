import { brief } from "raea/brief";

export default brief({
  title: "Zero Form launch",
  logline: "A 30-second launch spot for Zero Form, cut from the recorded end-to-end demo.",
  for: "Friday Shipping Club",
  audience: "Founders and agency staff who file Taipei company-incorporation paperwork; social feeds and the README, often muted",
  believe: "Starting a company takes 3 answers, not 7 forms",
  mode: ["pitch"],
  sound: "Music only, no voice: a soft grand piano (VCSL Steinway B, CC0). The picture carries it muted.",
  look: "Paper #F5F5F2 ground, ink #0E1116 type, accent #2B50FF, confirmation green #0F8A4F; Inter ExtraBold headlines; the real app screens as cards.",
  notDoing: ["invented numbers", "voiceover", "a feature tour without the one applicant's loop"],
  assumed: ["audience", "believe", "sound", "deliver"],
  sections: [
    {
      heading: "Facts (from README.md and the demo recording)",
      text: "7 official Taipei incorporation forms. 47 fields on 7 forms, 11 different facts, the applicant types 3. One confirmation bound to a SHA-256 snapshot and sealed with Ed25519. The confirmed values are written onto the official PDFs. Altering stored data after signing turns identity, integrity and consistency red.",
    },
  ],
  deliver: [{ name: "zero-form-launch", specs: ["30 s", "16:9", "1920x1080", "with sound"] }],
});
