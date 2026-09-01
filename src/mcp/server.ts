#!/usr/bin/env node
/**
 * `poly-mcp` entry point.
 *
 * A launcher only: see src/preflight.ts. It matters most here, because a
 * dependency failure over stdio reaches the client as nothing but
 * "MCP error -32000: Connection closed".
 */

import { launch } from "../preflight.js";

await launch(import.meta.url, () => import("./run.js"));
