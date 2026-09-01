#!/usr/bin/env node
/**
 * `poly` entry point.
 *
 * A launcher only: see src/preflight.ts for why the real CLI is loaded
 * dynamically rather than imported.
 */

import { launch } from "../preflight.js";

await launch(import.meta.url, () => import("./run.js"));
