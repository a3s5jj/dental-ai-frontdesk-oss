/**
 * validate_workflow.mjs - structural checks on the front desk workflows.
 *
 *   node validate_workflow.mjs
 *
 * Cheap, offline, no API calls. Run it after you edit a workflow JSON and before you import.
 * Catches a connection pointing at a node that does not exist, a node left orphaned, a
 * duplicate id, a decision schema that no longer parses as JSON, an n8n expression missing
 * its leading "=", and the two mistakes that are specific to customizing this template:
 * a timezone changed in some places but not others, and REPLACE_ placeholders left unfilled.
 *
 * Exits non-zero on any failure so it can gate a deploy.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wfDir = resolve(here, '..', 'workflows');

/** Nodes that are legitimately entry points, so being unreachable is expected. */
const TRIGGER_TYPES = [
  'n8n-nodes-base.webhook',
  '@n8n/n8n-nodes-langchain.chatTrigger',
  'n8n-nodes-base.manualTrigger',
  'n8n-nodes-base.scheduleTrigger',
  'n8n-nodes-base.googleDriveTrigger',
  'n8n-nodes-base.errorTrigger',
];
/** Sticky notes and AI sub-nodes hang off other nodes, not off main connections. */
const NON_MAIN = ['n8n-nodes-base.stickyNote'];

const failures = [];
const notes = [];

function check(cond, msg) {
  if (!cond) failures.push(msg);
}

function loadWorkflow(file) {
  const wf = JSON.parse(readFileSync(resolve(wfDir, file), 'utf8'));
  const names = new Set(wf.nodes.map((n) => n.name));

  // duplicate names and ids
  check(names.size === wf.nodes.length, `${file}: duplicate node NAMES present`);
  const ids = wf.nodes.map((n) => n.id);
  check(new Set(ids).size === ids.length, `${file}: duplicate node IDS present`);

  // every connection target exists
  for (const [src, conn] of Object.entries(wf.connections)) {
    check(names.has(src), `${file}: connections reference unknown source node "${src}"`);
    for (const group of Object.values(conn)) {
      for (const branch of group) {
        for (const target of branch || []) {
          check(
            names.has(target.node),
            `${file}: "${src}" connects to unknown node "${target.node}"`
          );
        }
      }
    }
  }

  // reachability over main connections, starting from triggers
  const reachable = new Set();
  const queue = wf.nodes.filter((n) => TRIGGER_TYPES.includes(n.type)).map((n) => n.name);
  check(queue.length > 0, `${file}: no trigger node found`);
  queue.forEach((n) => reachable.add(n));
  while (queue.length) {
    const cur = queue.shift();
    const conn = wf.connections[cur];
    if (!conn) continue;
    for (const group of Object.values(conn)) {
      for (const branch of group) {
        for (const target of branch || []) {
          if (!reachable.has(target.node)) {
            reachable.add(target.node);
            queue.push(target.node);
          }
        }
      }
    }
  }
  // AI sub-nodes attach upward, and they chain: a fixer model hangs off the output parser, which
  // hangs off the agent. Repeat until nothing new is reached rather than assuming one hop.
  let grew = true;
  while (grew) {
    grew = false;
    for (const [src, conn] of Object.entries(wf.connections)) {
      for (const [type, group] of Object.entries(conn)) {
        if (type === 'main') continue;
        for (const branch of group) {
          for (const target of branch || []) {
            if (reachable.has(target.node) && !reachable.has(src)) {
              reachable.add(src);
              grew = true;
            }
          }
        }
      }
    }
  }
  for (const n of wf.nodes) {
    if (NON_MAIN.includes(n.type)) continue;
    check(reachable.has(n.name), `${file}: node "${n.name}" is unreachable`);
  }

  // the decision schema must still be valid JSON
  const parser = wf.nodes.find((n) => n.name === 'Structured Decision Parser');
  if (parser) {
    try {
      const schema = JSON.parse(parser.parameters.inputSchema);
      check(
        schema.properties && typeof schema.properties === 'object',
        `${file}: decision schema has no properties object`
      );
      notes.push(`${file}: decision schema ok, ${Object.keys(schema.properties).length} properties`);
    } catch (err) {
      failures.push(`${file}: decision schema is not valid JSON: ${err.message}`);
    }
  }

  // every n8n expression should start with "=" or it is stored as a literal string
  let exprCount = 0;
  const walk = (v) => {
    if (typeof v === 'string') {
      if (v.includes('{{') && !v.startsWith('=')) {
        failures.push(`${file}: expression missing the leading "=": ${v.slice(0, 70)}`);
      }
      if (v.startsWith('=')) exprCount++;
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  // Sticky notes are documentation; their markdown may legitimately contain braces.
  wf.nodes.filter((n) => !NON_MAIN.includes(n.type)).forEach((n) => walk(n.parameters));
  notes.push(`${file}: ${wf.nodes.length} nodes, ${exprCount} expressions`);

  return wf;
}

const wf = loadWorkflow('dental_front_desk.json');
loadWorkflow('knowledge_ingestion.json');

// ---------------------------------------------------------------- timezone
// The timezone is written as a literal in a dozen date expressions as well as in the clinic
// profile block. Changing it in some places and not others does not throw: it silently books
// people at the wrong hour and breaks the reschedule and cancel lookups. So insist they agree.
const prep = wf.nodes.find((n) => n.name === 'Prepare Conversation State');
const configured = (prep?.parameters.jsCode || '').match(/clinic_timezone:\s*'([^']+)'/)?.[1];
check(Boolean(configured), 'clinic_timezone is not set in Prepare Conversation State');

if (configured) {
  // Match against the real IANA list, not a slash-shaped regex. "AM/PM", "docs/SOP_CUSTOMIZE"
  // and the "b/gi" of a regex literal all look like timezones otherwise.
  const IANA = new Set(Intl.supportedValuesOf('timeZone'));
  const zones = new Map();
  const collect = (v, nodeName) => {
    if (typeof v === 'string') {
      for (const z of v.match(/[A-Za-z]+(?:\/[A-Za-z_]+)+/g) || []) {
        if (!IANA.has(z)) continue;
        if (!zones.has(z)) zones.set(z, new Set());
        zones.get(z).add(nodeName);
      }
    } else if (Array.isArray(v)) v.forEach((x) => collect(x, nodeName));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => collect(x, nodeName));
  };
  wf.nodes
    .filter((n) => !NON_MAIN.includes(n.type))
    .forEach((n) => collect(n.parameters, n.name));

  for (const [zone, nodeNames] of zones) {
    check(
      zone === configured,
      `timezone: "${zone}" in ${[...nodeNames].join(', ')} does not match ` +
        `clinic_timezone "${configured}". Every timezone literal must be the same. ` +
        `See docs/SOP_CUSTOMIZE.md.`
    );
  }
  notes.push(`timezone: ${configured}, consistent across ${zones.get(configured)?.size ?? 0} nodes`);
}

// ------------------------------------------------------------ placeholders
// Not a failure. This template ships with deliberate blanks, and the whole point is to make
// them impossible to miss. Report them so `npm test` doubles as a go-live checklist.
const pending = new Map();
for (const n of wf.nodes) {
  for (const p of (JSON.stringify(n.parameters ?? {}) + JSON.stringify(n.credentials ?? {}))
    .match(/REPLACE_[A-Z_]+/g) || []) {
    if (!pending.has(p)) pending.set(p, new Set());
    pending.get(p).add(n.name);
  }
}
if (pending.size) {
  notes.push(`placeholders: ${pending.size} still unfilled, this workflow is NOT ready to activate`);
  for (const [p, nodeNames] of pending) notes.push(`    ${p}  ->  ${[...nodeNames].join(', ')}`);
} else {
  notes.push('placeholders: none left, workflow is configured');
}

for (const n of notes) console.log('  ' + n);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  console.log(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log('\nall structural checks passed');
