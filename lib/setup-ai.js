// Agency setup: Claude reads each official form PDF once and maps its boxes to shared facts.
// POST /api/setup/read {mode: 'ai' | 'demo'} → same shape as public/setup/fields.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const run = promisify(execFile);
const ROOT = process.cwd();
if (fs.existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile(path.join(ROOT, '.env.local'));
const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

const FACTS = {
  'company.name': 'company name', 'company.items': 'business items / scope', 'company.address': 'registered company address',
  'company.capital': 'total capital amount', 'reservation.id': 'name-reservation (預查) number', 'person.name': 'representative / responsible person name',
  'person.nationalId': 'national ID number', 'person.phone': 'contact phone', 'person.address': 'home address', 'app.date': 'a date to fill in',
  'owner.name': 'building owner name',
};
const Fields = z.object({
  fields: z.array(z.object({
    label: z.string().describe('The field label exactly as printed on the page, copied character for character, without spaces'),
    fact: z.enum([...Object.keys(FACTS), 'other']),
    meaning: z.string().describe('Short English meaning of the field'),
  })),
});

const PROMPT = `This is page 1 of an official Taiwanese government form for registering a limited company.
List every box where the APPLICANT must write information (not official-use boxes, seals or instructions).
For each, copy the printed label exactly and map it to one shared fact key:
${Object.entries(FACTS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
- other: anything that is none of the above
Use one entry per box; if two boxes ask for the same fact, list both.`;

async function readForm(form) {
  const pdf = fs.readFileSync(path.join(ROOT, 'bench/forms', `${form.id}.pdf`)).toString('base64');
  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low', format: zodOutputFormat(Fields) },
    messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
      { type: 'text', text: PROMPT },
    ] }],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error(`Claude could not read ${form.id}`);
  const wanted = response.parsed_output.fields.filter((f) => f.fact !== 'other');
  const child = execFile('python3', ['scripts/extract-form-fields.py', 'locate', form.id], { cwd: ROOT });
  child.stdin.end(JSON.stringify(wanted));
  let out = ''; for await (const c of child.stdout) out += c;
  const located = JSON.parse(out);
  return { ...form, fields: located.fields, other: response.parsed_output.fields.length - wanted.length, missed: located.missed };
}

export function registerSetupRoutes(app) {
  app.post('/api/setup/read', async (q, r) => {
    const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/setup/fields.json'), 'utf8'));
    if (q.body?.mode !== 'ai') return r.json({ mode: 'demo', forms: demo });
    if (!client) return r.status(503).json({ error: 'No Claude API key. Put CLAUDE_API_KEY in .env.local, or use demo mode.' });
    try {
      const forms = await Promise.all(demo.map(({ id, name, en, source, image, aspect }) => readForm({ id, name, en, source, image, aspect })));
      r.json({ mode: 'ai', model: 'claude-opus-5-5', forms });
    } catch (e) {
      const status = e instanceof Anthropic.APIError ? e.status ?? 502 : 502;
      r.status(status).json({ error: e.message });
    }
  });
}
