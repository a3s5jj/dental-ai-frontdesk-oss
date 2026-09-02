import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EDGE_GAP,
  NODE_STEP,
  WORKFLOW_FILES,
  WORKFLOW_LAYOUTS,
  validateWorkflowLayout,
} from './workflow_layouts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workflowDir = resolve(here, '..', 'workflows');
let checks = 0;

function check(condition, message) {
  checks++;
  if (!condition) throw new Error(message);
}

check(NODE_STEP === 208, 'canonical node step must remain 208px');
check(EDGE_GAP === 112, 'canonical edge gap must remain 112px');

for (const file of WORKFLOW_FILES) {
  const workflow = JSON.parse(readFileSync(resolve(workflowDir, file), 'utf8'));
  const spec = validateWorkflowLayout(workflow);

  check(spec.file === file, `${file}: id maps to ${spec.file}`);
  check(
    workflow.nodes.every(
      (node) => JSON.stringify(node.position) === JSON.stringify(spec.positions[node.name]),
    ),
    `${file}: current node positions do not match the registered layout`,
  );

  const operational = workflow.nodes.filter(
    (node) => node.type !== 'n8n-nodes-base.stickyNote',
  );
  const firstOperationalY = Math.min(...operational.map((node) => node.position[1]));
  for (const note of workflow.nodes.filter(
    (node) => node.type === 'n8n-nodes-base.stickyNote',
  )) {
    const noteBottom = note.position[1] + Number(note.parameters.height ?? 160);
    check(
      noteBottom <= firstOperationalY - EDGE_GAP,
      `${file}: ${note.name} overlaps the operational canvas`,
    );
  }

  console.log(`PASS  ${file.padEnd(28)} ${workflow.nodes.length} nodes`);
}

check(
  Object.keys(WORKFLOW_LAYOUTS).length === 2,
  'layout registry must contain exactly two canonical workflows',
);

console.log(`\n${checks}/${checks} layout checks passed`);
