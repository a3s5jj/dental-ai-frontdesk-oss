import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKFLOW_FILES,
  applyWorkflowLayout,
  stripNodePositions,
  validateWorkflowLayout,
} from './workflow_layouts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workflowDir = resolve(here, '..', 'workflows');

for (const file of WORKFLOW_FILES) {
  const path = resolve(workflowDir, file);
  const source = readFileSync(path, 'utf8');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const workflow = JSON.parse(source);
  const spec = validateWorkflowLayout(workflow);
  if (spec.file !== file) {
    throw new Error(`${file}: workflow id ${workflow.id} belongs to ${spec.file}`);
  }

  const beforeWithoutPositions = JSON.stringify(stripNodePositions(workflow));
  const oldPositions = new Map(
    workflow.nodes.map((node) => [node.name, JSON.stringify(node.position)]),
  );

  applyWorkflowLayout(workflow);

  const afterWithoutPositions = JSON.stringify(stripNodePositions(workflow));
  if (beforeWithoutPositions !== afterWithoutPositions) {
    throw new Error(`${file}: applying the layout changed non-position workflow data`);
  }

  const moved = workflow.nodes.filter(
    (node) => oldPositions.get(node.name) !== JSON.stringify(node.position),
  ).length;
  const rendered = `${JSON.stringify(workflow, null, 2).replace(/\n/g, eol)}${eol}`;
  if (rendered !== source) writeFileSync(path, rendered, 'utf8');
  console.log(`${file}: ${workflow.nodes.length} nodes mapped, ${moved} moved`);
}
