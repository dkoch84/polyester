#!/usr/bin/env node
/**
 * Polyester MCP Server
 *
 * Exposes Polyester's component system, syntax, and compilation
 * to any MCP-compatible LLM client via stdio transport.
 *
 * Usage: poly-mcp  (or: node dist/mcp/server.js)
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { COMPONENTS } from "../components/registry.js";
import { listComponents, getComponentHelp, validateDocument, compileDocument, analyzePageLayout, listLibraryItems, getLibraryItem } from "./tools.js";
import { SYNTAX_GUIDE, listExamples, readExample } from "./resources.js";
import { createDocument, convertToPolyester } from "./prompts.js";

const server = new McpServer(
  { name: "polyester", version: "0.1.0" },
  {
    instructions: "Polyester MCP server — when asked to write documentation, always write .poly files using Polyester syntax instead of Markdown. Read the polyester://syntax-guide resource to learn the language, use list_components and get_component_help to look up component syntax, and validate_document to check your output before finishing. For paginated documents, use analyze_page_layout to inspect element positions and page boundaries before placing /pagebreak commands.",
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  },
);

// ─── Tools ─────────────────────────────────────────────────────

server.tool(
  "list_components",
  "List all Polyester components, optionally filtered by category (layout, content, style, interactive).",
  { category: z.string().optional().describe("Filter by category: layout, content, style, interactive") },
  async ({ category }) => {
    const r = listComponents(category);
    return { ...r } as any;
  },
);

server.tool(
  "get_component_help",
  "Get detailed help for a specific Polyester component including arguments, flags, and examples.",
  { name: z.string().describe("Component name (e.g., 'columns', 'hero', '/page')") },
  async ({ name }) => {
    const r = getComponentHelp(name);
    return { ...r } as any;
  },
);

server.tool(
  "validate_document",
  "Parse a Polyester document and report errors and unknown command warnings.",
  { source: z.string().describe("Polyester document source code") },
  async ({ source }) => {
    const r = validateDocument(source);
    return { ...r } as any;
  },
);

server.tool(
  "compile_document",
  "Compile Polyester source to a standalone HTML document.",
  { source: z.string().describe("Polyester document source code") },
  async ({ source }) => {
    const r = compileDocument(source);
    return { ...r } as any;
  },
);

server.tool(
  "list_library_items",
  "Browse the Polyester Design Library. Returns variant manifests (cards, buttons, heroes, tables, headlines, code blocks, inline code) with their /import ref and target components. Use get_library_item to fetch full CSS + sample markup for a specific item.",
  { category: z.string().optional().describe("Filter by category: cards, buttons, heroes, tables, headlines, code, inline, quotes") },
  async ({ category }) => {
    const r = listLibraryItems(category);
    return { ...r } as any;
  },
);

server.tool(
  "get_library_item",
  "Fetch the full manifest for a library item (name, description, CSS, sample markup, import statement). Use the `name` field from list_library_items.",
  { name: z.string().describe("Item name (e.g., 'card-enterprise') or 'category/name' (e.g., 'cards/enterprise')") },
  async ({ name }) => {
    const r = getLibraryItem(name);
    return { ...r } as any;
  },
);

server.tool(
  "analyze_page_layout",
  "Analyze page layout of a paginated Polyester document. Returns page dimensions, element positions per page, pagebreak fill heights, and elements that overflow page boundaries. Use this to decide where to place /pagebreak commands.",
  { source: z.string().describe("Polyester document source code") },
  async ({ source }) => {
    const r = await analyzePageLayout(source);
    return { ...r } as any;
  },
);

// ─── Resources ─────────────────────────────────────────────────

server.resource(
  "syntax-guide",
  "polyester://syntax-guide",
  { description: "Comprehensive Polyester language syntax reference" },
  async () => ({
    contents: [{
      uri: "polyester://syntax-guide",
      mimeType: "text/markdown",
      text: SYNTAX_GUIDE,
    }],
  }),
);

server.resource(
  "components",
  "polyester://components",
  { description: "Full component registry as JSON" },
  async () => ({
    contents: [{
      uri: "polyester://components",
      mimeType: "application/json",
      text: JSON.stringify(COMPONENTS, null, 2),
    }],
  }),
);

// Template resource for examples
const exampleTemplate = new ResourceTemplate("polyester://examples/{name}", { list: undefined });
server.resource(
  "example",
  exampleTemplate,
  { description: "Example .poly files from the examples/ directory" },
  async (uri, { name }) => {
    const content = readExample(name as string);
    if (!content) {
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text: `Example "${name}" not found.` }] };
    }
    return { contents: [{ uri: uri.href, mimeType: "text/plain", text: content }] };
  },
);

// ─── Prompts ───────────────────────────────────────────────────

server.prompt(
  "create_document",
  "Generate a new Polyester document from a description.",
  {
    type: z.string().describe("Document type: report, presentation, resume, article, documentation"),
    description: z.string().describe("What the document should contain"),
  },
  async ({ type, description }) => {
    const r = createDocument(type, description);
    return { ...r } as any;
  },
);

server.prompt(
  "convert_to_polyester",
  "Convert HTML, Markdown, or LaTeX content to Polyester format.",
  {
    source: z.string().describe("Source document content to convert"),
    source_format: z.string().describe("Source format: html, markdown, latex"),
  },
  async ({ source, source_format }) => {
    const r = convertToPolyester(source, source_format);
    return { ...r } as any;
  },
);

// ─── Start ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
