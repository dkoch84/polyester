#!/usr/bin/env node
/**
 * `poly-lsp` entry point.
 *
 * A launcher only: see src/preflight.ts.
 */

import { launch } from "../preflight.js";

await launch(import.meta.url, () => import("./run.js"));
