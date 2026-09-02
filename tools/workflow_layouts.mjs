export const DOT_SIZE = 16;
export const NODE_SIZE = 96;
export const GAP_DOTS = 7;
export const EDGE_GAP = DOT_SIZE * GAP_DOTS;
export const NODE_STEP = NODE_SIZE + EDGE_GAP;

const grid = (column, row) => [column * NODE_STEP, row * NODE_STEP];
const lane = (row, startColumn, names) =>
  Object.fromEntries(names.map((name, index) => [name, grid(startColumn + index, row)]));
const noteAbove = (x, height) => [x, -(height + EDGE_GAP)];

export const DENTAL_FRONT_DESK_LAYOUT = Object.freeze({
  'Checklist Note': noteAbove(0, 1380),
  'Reminder Note': noteAbove(632, 240),

  ...lane(0, 0, [
    'Meta Webhook Verify',
    'Check Meta Verify Token',
    'Respond Meta Challenge',
  ]),
  ...lane(2, 0, ['Meta Inbound Webhook', 'Normalize Meta Message']),
  ...lane(3, 0, ['Generic Inquiry Webhook', 'Normalize Generic Message']),
  'Prepare Conversation State': grid(2, 2),

  'AI RAG Front Desk Agent': grid(4, 2),
  ...lane(2, 6, [
    'Attach Conversation State',
    'Parse Agent Decision',
    'Mobile Needs Recheck?',
    'Reschedule or Cancel?',
    'Ready To Book?',
  ]),
  'Build Mobile Recheck Reply': grid(8, 1),

  ...lane(0, 24, ['Reply Overridden?', 'Drop Agent Draft']),
  'Record Final Reply': grid(27, 0),
  'Reply Via Meta?': grid(24, 2),
  'Send Meta Reply': grid(25, 1),
  'Respond Generic Webhook': grid(25, 2),

  ...lane(3, 11, ['Check Hours', 'Booking Time OK?']),
  ...lane(3, 16, [
    'Booking Confirmed?',
    'Slot Still Free?',
    'Attach Availability',
    'Slot Free?',
    'Create Calendar Appointment',
    'Attach Booking Context',
    'Compose Booking Success',
  ]),
  'Build Fallback Reply': grid(6, 3),
  ...lane(3, 24, ['Build Chat Row', 'Append All Chats']),

  'Build Reject Reply': grid(12, 4),
  'Build Booking Confirm Prompt': grid(16, 4),
  'Build Slot Taken Reply': grid(19, 4),
  ...lane(4, 24, ['Staff Email Needed?', 'Send Staff Email']),

  ...lane(5, 10, [
    'Find Appointment',
    'Match Patient To Event',
    'Attach Manage Context',
    'Appointment Found?',
    'Lookup Only?',
    'Manage Confirmed?',
    'Cancel or Move?',
    'Delete Appointment',
    'Compose Cancel Reply',
  ]),
  ...lane(5, 24, ['Human Task Needed?', 'Build ToDo Row', 'Append To Do']),

  'Manage Not Found': grid(13, 6),
  'Build Lookup Reply': grid(14, 6),
  'Build Manage Confirm Prompt': grid(15, 6),
  ...lane(6, 16, [
    'Check Move Hours',
    'Move Time OK?',
    'Find Conflicts',
    'Aggregate Conflicts',
    'Attach Move Context',
    'New Slot Free?',
    'Update Appointment',
    'Compose Reschedule Reply',
  ]),
  ...lane(6, 24, ['Build Booking Row', 'Append Bookings']),

  'Build Move Reject Reply': grid(17, 7),
  'Build Move Busy Reply': grid(21, 7),
  ...lane(7, 24, ['Build Reminder Checklist Row', 'Append Reminder Checklist']),

  ...lane(8, 3, [
    'Anthropic Chat Model',
    'Check Availability',
    'Conversation Memory',
    'Structured Decision Parser',
  ]),
  'Supabase RAG Tool': grid(8, 8),
  'Anthropic Fixer Model': grid(6, 9),
  'OpenAI Embeddings': grid(8, 9),

  ...lane(10, 0, ['Workflow Error Trigger', 'Email Workflow Error To Staff']),
});

export const DENTAL_INGESTION_LAYOUT = Object.freeze({
  'Sticky Note Trigger': noteAbove(0, 150),
  'Sticky Note Ingest': noteAbove(592, 150),
  ...lane(0, 0, [
    'Google Drive Trigger',
    'Download File',
    'Supabase Vector Store (Insert)',
  ]),
  'Embeddings OpenAI': grid(1, 1),
  'Default Data Loader': grid(2, 1),
  'Recursive Character Text Splitter': grid(2, 2),
});

const DENTAL_HORIZONTAL_GROUPS = [
  ['Meta Webhook Verify', 'Check Meta Verify Token', 'Respond Meta Challenge'],
  ['Meta Inbound Webhook', 'Normalize Meta Message', 'Prepare Conversation State'],
  ['Generic Inquiry Webhook', 'Normalize Generic Message'],
  ['Attach Conversation State', 'Parse Agent Decision', 'Mobile Needs Recheck?', 'Reschedule or Cancel?', 'Ready To Book?'],
  ['Reply Overridden?', 'Drop Agent Draft'],
  ['Reply Via Meta?', 'Respond Generic Webhook'],
  ['Check Hours', 'Booking Time OK?'],
  ['Booking Confirmed?', 'Slot Still Free?', 'Attach Availability', 'Slot Free?', 'Create Calendar Appointment', 'Attach Booking Context', 'Compose Booking Success'],
  ['Build Chat Row', 'Append All Chats'],
  ['Staff Email Needed?', 'Send Staff Email'],
  ['Find Appointment', 'Match Patient To Event', 'Attach Manage Context', 'Appointment Found?', 'Lookup Only?', 'Manage Confirmed?', 'Cancel or Move?', 'Delete Appointment', 'Compose Cancel Reply'],
  ['Human Task Needed?', 'Build ToDo Row', 'Append To Do'],
  ['Check Move Hours', 'Move Time OK?', 'Find Conflicts', 'Aggregate Conflicts', 'Attach Move Context', 'New Slot Free?', 'Update Appointment', 'Compose Reschedule Reply'],
  ['Build Booking Row', 'Append Bookings'],
  ['Build Reminder Checklist Row', 'Append Reminder Checklist'],
  ['Anthropic Chat Model', 'Check Availability', 'Conversation Memory', 'Structured Decision Parser'],
  ['Workflow Error Trigger', 'Email Workflow Error To Staff'],
];

const DENTAL_VERTICAL_GROUPS = [
  ['Send Meta Reply', 'Respond Generic Webhook'],
  ['Booking Time OK?', 'Build Reject Reply'],
  ['Booking Confirmed?', 'Build Booking Confirm Prompt'],
  ['Slot Free?', 'Build Slot Taken Reply'],
  ['Appointment Found?', 'Manage Not Found'],
  ['Lookup Only?', 'Build Lookup Reply'],
  ['Manage Confirmed?', 'Build Manage Confirm Prompt'],
  ['Move Time OK?', 'Build Move Reject Reply'],
  ['New Slot Free?', 'Build Move Busy Reply'],
  ['Structured Decision Parser', 'Anthropic Fixer Model'],
  ['Supabase RAG Tool', 'OpenAI Embeddings'],
];

const DENTAL_NODE_DIMENSIONS = Object.freeze({
  'AI RAG Front Desk Agent': [224, 96],
  'Structured Decision Parser': [240, 80],
  'Supabase RAG Tool': [240, 80],
  'Drop Agent Draft': [224, 96],
  'Record Final Reply': [224, 96],
});

export const WORKFLOW_LAYOUTS = Object.freeze({
  DentalFrontDesk01: Object.freeze({
    file: 'dental_front_desk.json',
    nodeCount: 78,
    positions: DENTAL_FRONT_DESK_LAYOUT,
    nodeDimensions: DENTAL_NODE_DIMENSIONS,
    horizontalGroups: DENTAL_HORIZONTAL_GROUPS,
    verticalGroups: DENTAL_VERTICAL_GROUPS,
  }),
  DentalKbIngest01: Object.freeze({
    file: 'knowledge_ingestion.json',
    nodeCount: 8,
    positions: DENTAL_INGESTION_LAYOUT,
    horizontalGroups: [
      ['Google Drive Trigger', 'Download File', 'Supabase Vector Store (Insert)'],
      ['Embeddings OpenAI', 'Default Data Loader'],
    ],
    verticalGroups: [
      ['Default Data Loader', 'Recursive Character Text Splitter'],
    ],
  }),
});

export const WORKFLOW_FILES = Object.freeze(
  Object.values(WORKFLOW_LAYOUTS).map(({ file }) => file),
);

function validateSpacingGroups(spec, groups, axis) {
  const primary = axis === 'horizontal' ? 0 : 1;
  const secondary = axis === 'horizontal' ? 1 : 0;
  for (const group of groups) {
    for (let index = 1; index < group.length; index++) {
      const previousName = group[index - 1];
      const currentName = group[index];
      const previous = spec.positions[previousName];
      const current = spec.positions[currentName];
      if (!previous || !current) {
        throw new Error(`${spec.file}: ${axis} spacing group references an unknown node`);
      }
      if (
        current[primary] - previous[primary] !== NODE_STEP ||
        current[secondary] !== previous[secondary]
      ) {
        throw new Error(
          `${spec.file}: ${previousName} -> ${currentName} is not exactly ${NODE_STEP}px ${axis}`,
        );
      }
    }
  }
}

function validateRectangles(workflow, spec) {
  const rectangles = workflow.nodes.map((node) => {
    const [x, y] = spec.positions[node.name];
    const isNote = node.type === 'n8n-nodes-base.stickyNote';
    const dimensions = spec.nodeDimensions?.[node.name] ?? [NODE_SIZE, NODE_SIZE];
    return {
      name: node.name,
      isNote,
      x,
      y,
      width: isNote ? Number(node.parameters.width ?? 160) : dimensions[0],
      height: isNote ? Number(node.parameters.height ?? 160) : dimensions[1],
    };
  });

  for (let left = 0; left < rectangles.length; left++) {
    for (let right = left + 1; right < rectangles.length; right++) {
      const a = rectangles[left];
      const b = rectangles[right];
      const overlaps =
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      if (overlaps) throw new Error(`${spec.file}: ${a.name} overlaps ${b.name}`);
    }
  }

  const operational = rectangles.filter((rectangle) => !rectangle.isNote);
  const firstOperationalY = Math.min(...operational.map((rectangle) => rectangle.y));
  for (const note of rectangles.filter((rectangle) => rectangle.isNote)) {
    if (note.y + note.height > firstOperationalY - EDGE_GAP) {
      throw new Error(`${spec.file}: ${note.name} is less than ${EDGE_GAP}px above the canvas`);
    }
  }
}

export function validateWorkflowLayout(workflow) {
  const spec = WORKFLOW_LAYOUTS[workflow.id];
  if (!spec) throw new Error(`No layout registered for workflow id ${workflow.id}`);
  if (workflow.nodes.length !== spec.nodeCount) {
    throw new Error(
      `${spec.file}: expected ${spec.nodeCount} nodes, found ${workflow.nodes.length}`,
    );
  }

  const nodeNames = workflow.nodes.map((node) => node.name);
  if (new Set(nodeNames).size !== nodeNames.length) {
    throw new Error(`${spec.file}: duplicate node names prevent deterministic layout`);
  }

  const mappedNames = Object.keys(spec.positions);
  const nodeNameSet = new Set(nodeNames);
  const mappedNameSet = new Set(mappedNames);
  const missing = nodeNames.filter((name) => !mappedNameSet.has(name));
  const unknown = mappedNames.filter((name) => !nodeNameSet.has(name));
  if (missing.length || unknown.length) {
    throw new Error(
      `${spec.file}: layout mismatch; missing=[${missing.join(', ')}], unknown=[${unknown.join(', ')}]`,
    );
  }

  const occupied = new Map();
  const operationalRows = new Set();
  for (const node of workflow.nodes) {
    const position = spec.positions[node.name];
    if (
      !Array.isArray(position) ||
      position.length !== 2 ||
      !position.every(Number.isFinite)
    ) {
      throw new Error(`${spec.file}: invalid position for ${node.name}`);
    }
    const key = position.join(',');
    if (occupied.has(key)) {
      throw new Error(`${spec.file}: ${node.name} and ${occupied.get(key)} share position ${key}`);
    }
    occupied.set(key, node.name);

    if (node.type !== 'n8n-nodes-base.stickyNote') {
      if (position[0] % NODE_STEP !== 0 || position[1] % NODE_STEP !== 0) {
        throw new Error(`${spec.file}: ${node.name} is off the ${NODE_STEP}px grid`);
      }
      operationalRows.add(position[1] / NODE_STEP);
    }
  }

  const maxRow = Math.max(...operationalRows);
  for (let row = 0; row <= maxRow; row++) {
    if (!operationalRows.has(row)) throw new Error(`${spec.file}: unused operational row ${row}`);
  }

  validateSpacingGroups(spec, spec.horizontalGroups ?? [], 'horizontal');
  validateSpacingGroups(spec, spec.verticalGroups ?? [], 'vertical');
  validateRectangles(workflow, spec);
  return spec;
}

export function applyWorkflowLayout(workflow) {
  const spec = validateWorkflowLayout(workflow);
  for (const node of workflow.nodes) node.position = [...spec.positions[node.name]];
  return workflow;
}

export function stripNodePositions(workflow) {
  const copy = structuredClone(workflow);
  for (const node of copy.nodes) delete node.position;
  return copy;
}
