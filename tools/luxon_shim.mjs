/**
 * luxon_shim.mjs - re-export Luxon without adding it as a dependency of this folder.
 *
 * The workflow expressions run against the Luxon that ships inside n8n, so the tests borrow
 * that exact copy rather than installing a second one that could drift to a different version.
 * Falls back to a local install if there ever is one.
 */

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const req = createRequire(import.meta.url);

function load() {
  try {
    return req('luxon');
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const path = resolve(globalRoot, 'n8n', 'node_modules', 'luxon', 'package.json');
    return createRequire(path)('luxon');
  }
}

export const { DateTime, Duration, Interval, Settings } = load();
