/**
 * LSP Completions
 *
 * Command documentation and completion providers.
 * Uses the centralized component registry.
 */

import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
} from "vscode-languageserver/node.js";
import {
  COMPONENTS,
  getComponent,
  type ComponentDef,
} from "../components/registry.js";

export interface FlagDoc {
  name: string;
  description: string;
  hasValue?: boolean;
}

export interface CommandDoc {
  description: string;
  usage: string;
  flags: FlagDoc[];
}

/**
 * Convert component definition to CommandDoc format for backwards compatibility
 */
function componentToCommandDoc(def: ComponentDef): CommandDoc {
  return {
    description: def.description,
    usage: def.examples[0] || `/${def.name}`,
    flags: def.flags.map((f) => ({
      name: `--${f.name}`,
      description: f.description,
      hasValue: f.hasValue,
    })),
  };
}

/**
 * Documentation for all built-in commands (derived from registry)
 */
export const COMMAND_DOCS: Record<string, CommandDoc> = Object.fromEntries(
  COMPONENTS.map((c) => [c.name, componentToCommandDoc(c)])
);

/**
 * Get completion items for commands
 */
export function getCommandCompletions(): CompletionItem[] {
  return COMPONENTS.map((def) => ({
    label: `/${def.name}`,
    kind: CompletionItemKind.Function,
    detail: def.description,
    documentation: {
      kind: MarkupKind.Markdown,
      value: formatCompletionDoc(def),
    },
    insertText: def.name,
  }));
}

/**
 * Format documentation for completion item
 */
function formatCompletionDoc(def: ComponentDef): string {
  const lines: string[] = [];

  lines.push(def.description);
  lines.push("");

  // Arguments
  if (def.args.length > 0) {
    lines.push("**Arguments:**");
    for (const arg of def.args) {
      const req = arg.required ? " *(required)*" : "";
      lines.push(`- \`${arg.name}\`${req}: ${arg.description}`);
    }
    lines.push("");
  }

  // Flags
  if (def.flags.length > 0) {
    lines.push("**Flags:**");
    for (const flag of def.flags) {
      const short = flag.short ? ` (-${flag.short})` : "";
      const val = flag.hasValue ? " `<value>`" : "";
      lines.push(`- \`--${flag.name}\`${short}${val}: ${flag.description}`);
    }
    lines.push("");
  }

  // Examples
  if (def.examples.length > 0) {
    lines.push("**Examples:**");
    lines.push("```polyester");
    lines.push(def.examples.join("\n"));
    lines.push("```");
  }

  return lines.join("\n");
}

/**
 * Get completion items for flags of a specific command
 */
export function getFlagCompletions(commandName: string): CompletionItem[] {
  const def = getComponent(commandName);
  if (!def) return [];

  const items: CompletionItem[] = [];

  for (const flag of def.flags) {
    // Long form --flag
    items.push({
      label: `--${flag.name}`,
      kind: CompletionItemKind.Property,
      detail: flag.description,
      insertText: flag.hasValue ? `${flag.name} ` : flag.name,
      documentation: flag.values
        ? `Allowed values: ${flag.values.join(", ")}`
        : undefined,
    });

    // Short form -f
    if (flag.short) {
      items.push({
        label: `-${flag.short}`,
        kind: CompletionItemKind.Property,
        detail: `${flag.description} (short for --${flag.name})`,
        insertText: flag.hasValue ? `${flag.short} ` : flag.short,
      });
    }
  }

  return items;
}

/**
 * Get all available themes for completion
 */
export function getThemeCompletions(): CompletionItem[] {
  // This would dynamically load themes from ~/.config/polyester/themes/
  // For now, return static list
  return [
    {
      label: "default",
      kind: CompletionItemKind.Color,
      detail: "Built-in GitHub Dark theme",
    },
  ];
}

/**
 * Get hover documentation for a command
 */
export function getCommandHoverDoc(commandName: string): string | undefined {
  const def = getComponent(commandName);
  if (!def) return undefined;

  return formatCompletionDoc(def);
}
