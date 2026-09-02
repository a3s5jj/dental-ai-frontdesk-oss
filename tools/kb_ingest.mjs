/**
 * kb_ingest.mjs - deterministic, repeatable knowledge base ingestion.
 *
 *   node kb_ingest.mjs status                       what is in the vector store right now
 *   node kb_ingest.mjs plan   <pdf> --tag <source>  extract and split, write nothing
 *   node kb_ingest.mjs ingest <pdf> --tag <source>  extract, split, embed, insert
 *   node kb_ingest.mjs purge  --source <source>     delete one source's chunks
 *   node kb_ingest.mjs query  "a question"          check what retrieval actually returns
 *
 * WHY THIS EXISTS
 *   The documented KB update procedure was: drop a PDF in a Drive folder, make sure the right
 *   one of two identically named n8n workflows is published, restart n8n so the poll trigger
 *   registers, wait a minute for it to fire, then delete the old rows by hand. That path has
 *   caused repeated operational failures. An older watched-folder workflow could not be
 *   published, and a fileCreated trigger cannot see a same-name re-upload.
 *
 *   This script does the same work with no Drive, no polling, no workflow activation and no
 *   n8n restart, using the SAME libraries n8n uses so the chunks come out the same shape:
 *   pdf-parse for extraction, @langchain/textsplitters with chunkSize 1000 and overlap 200,
 *   and OpenAI text-embedding-3-small at 1536 dimensions. All three are borrowed from the
 *   global n8n install rather than installed again, so they cannot drift to another version.
 *
 *   The n8n ingestion workflow is left in place and still works. This is the path to use when
 *   you want the update to be repeatable and reviewable.
 *
 * SAFE ORDER, learned the hard way on 2026-08-14: ingest the new document FIRST, verify
 * retrieval returns it, and only then purge the old source. The knowledge base is never empty
 * in between, and the delete stays scoped to one source. `purge` refuses to empty the table.
 *
 * TAGGING: `--tag` sets metadata.source, which is the only handle purge has. Always give a new
 * document a NEW tag. Re-using a tag makes the old and new chunks indistinguishable, and then a
 * purge by source deletes both.
 */

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/* ---------------------------------------------------------------- borrowed deps */

function n8nRequire(pkg) {
  // Borrowed from the global n8n install on purpose, so the chunks this script produces cannot
  // drift to a different library version than the ones the n8n ingestion workflow produces.
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const entry = resolve(globalRoot, 'n8n', 'node_modules', pkg, 'package.json');
    return createRequire(entry)(pkg);
  } catch {
    throw new Error(
      [
        `Could not load "${pkg}" from the global n8n install.`,
        '',
        'This script deliberately reuses the pdf-parse and @langchain/textsplitters copies',
        'that n8n itself ships, so its chunks come out the same shape as the workflow.',
        'Install n8n globally first:',
        '',
        '  npm install -g n8n',
      ].join('\n')
    );
  }
}

/* ---------------------------------------------------------------- env */

function loadEnv() {
  const envPath = resolve(root, '.env');
  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    throw new Error(
      [
        `No .env file at ${envPath}`,
        '',
        'Copy the template and fill in your own keys:',
        '',
        '  cp .env.example .env',
        '',
        'This script needs SUPABASE_URL, SUPABASE_SERVICE_KEY and OPENAI_API_KEY.',
      ].join('\n')
    );
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY']) {
    if (!env[k]) throw new Error(`${k} is missing or empty in .env`);
  }
  return env;
}

const env = loadEnv();
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const sbHeaders = {
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

/* ---------------------------------------------------------------- helpers */

async function currentSources() {
  const res = await fetch(`${SB}/rest/v1/documents?select=id,metadata`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  const bySource = {};
  for (const r of rows) {
    const s = (r.metadata && r.metadata.source) || '(none)';
    bySource[s] = (bySource[s] || 0) + 1;
  }
  return { total: rows.length, bySource };
}

async function extractText(pdfPath) {
  const { PDFParse } = n8nRequire('pdf-parse');
  const buf = readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const res = await parser.getText();
    // pdf-parse v2 injects a "-- 1 of 5 --" marker between pages. Left in, the splitter turns
    // each one into its own 12 character chunk, which then sits in the vector store as a
    // meaningless row that can still be returned as a match. Strip them before splitting.
    return res.text
      .replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } finally {
    await parser.destroy();
  }
}

async function split(text) {
  const { RecursiveCharacterTextSplitter } = n8nRequire('@langchain/textsplitters');
  // identical settings to the Recursive Character Text Splitter node in the n8n workflow
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  return splitter.splitText(text);
}

async function embed(chunks) {
  const OpenAI = n8nRequire('openai').default || n8nRequire('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const out = [];
  // batched, because one request per chunk is needless latency and cost overhead
  for (let i = 0; i < chunks.length; i += 64) {
    const batch = chunks.slice(i, i + 64);
    const res = await client.embeddings.create({ model: 'text-embedding-3-small', input: batch });
    for (const d of res.data) out.push(d.embedding);
  }
  return out;
}

/* ---------------------------------------------------------------- commands */

async function cmdStatus() {
  const { total, bySource } = await currentSources();
  console.log(`vector store: ${total} chunk(s)`);
  for (const [s, n] of Object.entries(bySource)) console.log(`  ${n.toString().padStart(3)}  ${s}`);
}

async function cmdPlan(pdfPath, tag) {
  const text = await extractText(pdfPath);
  const chunks = await split(text);
  console.log(`source document : ${pdfPath}`);
  console.log(`extracted text  : ${text.length} chars`);
  console.log(`would insert    : ${chunks.length} chunk(s) tagged "${tag}"`);
  console.log(`chunk sizes     : ${chunks.map((c) => c.length).join(', ')}`);
  console.log('\nfirst chunk:\n' + chunks[0].slice(0, 300) + '\n...');
  const gapHits = chunks.filter((c) => /not confirmed|not published|still confirming/i.test(c)).length;
  console.log(`chunks mentioning an unconfirmed answer: ${gapHits}`);
  return chunks;
}

async function cmdIngest(pdfPath, tag) {
  const before = await currentSources();
  if (before.bySource[tag]) {
    throw new Error(
      `source tag "${tag}" already has ${before.bySource[tag]} chunk(s). Use a new tag, or purge that source first.`
    );
  }
  const chunks = await cmdPlan(pdfPath, tag);
  console.log('\nembedding...');
  const vectors = await embed(chunks);
  if (vectors.length !== chunks.length) throw new Error('embedding count does not match chunk count');
  if (vectors[0].length !== 1536) {
    throw new Error(`expected 1536 dimensions to match the retriever, got ${vectors[0].length}`);
  }

  const rows = chunks.map((content, i) => ({
    content,
    metadata: { source: tag, ingested_by: 'kb_ingest.mjs', ingested_at: new Date().toISOString(), chunk: i },
    embedding: vectors[i],
  }));

  const res = await fetch(`${SB}/rest/v1/documents`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
  const inserted = await res.json();
  console.log(`inserted ${inserted.length} chunk(s) tagged "${tag}"`);
  await cmdStatus();
}

async function cmdPurge(source) {
  const before = await currentSources();
  if (!before.bySource[source]) throw new Error(`no chunks found with source "${source}"`);
  const remaining = before.total - before.bySource[source];
  if (remaining <= 0) {
    throw new Error(
      `refusing to purge: that would leave the knowledge base empty. Ingest the replacement first.`
    );
  }
  const res = await fetch(`${SB}/rest/v1/documents?metadata->>source=eq.${encodeURIComponent(source)}`, {
    method: 'DELETE',
    headers: sbHeaders,
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status} ${await res.text()}`);
  console.log(`purged "${source}", ${remaining} chunk(s) remain`);
  await cmdStatus();
}

async function cmdQuery(question) {
  const OpenAI = n8nRequire('openai').default || n8nRequire('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const e = await client.embeddings.create({ model: 'text-embedding-3-small', input: question });
  // match_documents is a postgres function, so it lives under /rpc/, not as a table
  const res = await fetch(`${SB}/rest/v1/rpc/match_documents`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({ query_embedding: e.data[0].embedding, match_count: 3, filter: {} }),
  });
  if (!res.ok) throw new Error(`match_documents failed: ${res.status} ${await res.text()}`);
  const hits = await res.json();
  console.log(`query: ${question}\n`);
  hits.forEach((h, i) => {
    console.log(`#${i + 1}  similarity ${Number(h.similarity).toFixed(4)}  source ${h.metadata?.source}`);
    console.log('    ' + h.content.replace(/\s+/g, ' ').slice(0, 240) + '\n');
  });
}

/* ---------------------------------------------------------------- cli */

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? null : rest[i + 1];
};
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));

try {
  if (!cmd || cmd === 'status') await cmdStatus();
  else if (cmd === 'plan') await cmdPlan(resolve(root, positional[0]), flag('tag') || basename(positional[0]));
  else if (cmd === 'ingest') await cmdIngest(resolve(root, positional[0]), flag('tag') || basename(positional[0]));
  else if (cmd === 'purge') await cmdPurge(flag('source'));
  else if (cmd === 'query') await cmdQuery(positional.join(' '));
  else {
    console.error(`unknown command "${cmd}". See the header of this file.`);
    process.exit(1);
  }
} catch (err) {
  console.error('\nFAILED: ' + err.message);
  process.exit(1);
}
