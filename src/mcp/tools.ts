/**
 * MCP Tools
 *
 * Tool handlers for the Polyester MCP server.
 */

import { parse } from "../parser/parser.js";
import { compileToHtml } from "../backends/html/compiler.js";
import {
  getComponent,
  formatComponentHelp,
  formatComponentsList,
  COMPONENTS,
  getComponentsByCategory,
  type ComponentDef,
} from "../components/registry.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// ─── list_components ───────────────────────────────────────────

export function listComponents(category?: string): ToolResult {
  if (category) {
    const validCategories = ["layout", "content", "style", "interactive"];
    if (!validCategories.includes(category)) {
      return {
        content: [{ type: "text", text: `Invalid category "${category}". Valid: ${validCategories.join(", ")}` }],
        isError: true,
      };
    }
    const components = getComponentsByCategory(category as ComponentDef["category"]);
    const result = components.map(c => ({
      name: c.name,
      description: c.description,
      hasBlock: c.hasBlock ?? false,
    }));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  return { content: [{ type: "text", text: formatComponentsList() }] };
}

// ─── get_component_help ────────────────────────────────────────

export function getComponentHelp(name: string): ToolResult {
  const cleanName = name.replace(/^\//, "");
  const component = getComponent(cleanName);
  if (!component) {
    return {
      content: [{ type: "text", text: `Unknown component: "${name}". Run list_components to see all available components.` }],
      isError: true,
    };
  }
  return { content: [{ type: "text", text: formatComponentHelp(component) }] };
}

// ─── validate_document ─────────────────────────────────────────

export function validateDocument(source: string): ToolResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const ast = parse(source);

    // Check for unknown commands
    for (const node of ast.children) {
      if (node.type === "command") {
        const comp = getComponent(node.name);
        if (!comp) {
          const line = node.loc?.start.line ?? "?";
          warnings.push(`Unknown command: /${node.name} (line ${line})`);
        }
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      return { content: [{ type: "text", text: "Document is valid. No errors or warnings." }] };
    }

    const parts: string[] = [];
    if (errors.length > 0) { parts.push("Errors:\n" + errors.map(e => `  - ${e}`).join("\n")); }
    if (warnings.length > 0) { parts.push("Warnings:\n" + warnings.map(w => `  - ${w}`).join("\n")); }
    return { content: [{ type: "text", text: parts.join("\n\n") }] };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Parse error: ${err.message}` }],
      isError: true,
    };
  }
}

// ─── compile_document ──────────────────────────────────────────

export function compileDocument(source: string): ToolResult {
  try {
    const ast = parse(source);
    const { html } = compileToHtml(ast, { standalone: true });
    return { content: [{ type: "text", text: html }] };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Compilation error: ${err.message}` }],
      isError: true,
    };
  }
}
