/**
 * Documentation Quick Pick
 *
 * Provides a searchable command palette for finding and
 * inserting Polyester components.
 */

import * as vscode from "vscode";
import { ComponentInfo, loadComponents } from "./docsTreeView";
import { showComponentDocs } from "./docsWebview";

interface ComponentQuickPickItem extends vscode.QuickPickItem {
  component: ComponentInfo;
}

/**
 * Show the component search quick pick
 */
export async function showComponentSearch(context: vscode.ExtensionContext): Promise<void> {
  const components = loadComponents();

  if (components.length === 0) {
    vscode.window.showWarningMessage(
      "Could not load Polyester components. Make sure the CLI is available."
    );
    return;
  }

  // Create quick pick items
  const items: ComponentQuickPickItem[] = components.map((comp) => ({
    label: `$(symbol-function) /${comp.name}`,
    description: comp.category,
    detail: comp.description,
    component: comp,
  }));

  // Show quick pick
  const quickPick = vscode.window.createQuickPick<ComponentQuickPickItem>();
  quickPick.items = items;
  quickPick.placeholder = "Search Polyester components...";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  // Add buttons for actions
  quickPick.buttons = [
    {
      iconPath: new vscode.ThemeIcon("book"),
      tooltip: "Show full documentation",
    },
  ];

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    if (selected) {
      // Insert basic snippet
      insertComponentSnippet(selected.component);
      quickPick.hide();
    }
  });

  quickPick.onDidTriggerButton((button) => {
    const selected = quickPick.selectedItems[0];
    if (selected && button.tooltip === "Show full documentation") {
      showComponentDocs(selected.component, context);
      quickPick.hide();
    }
  });

  quickPick.onDidTriggerItemButton((event) => {
    // If we add item-level buttons in the future
    showComponentDocs(event.item.component, context);
    quickPick.hide();
  });

  quickPick.show();
}

/**
 * Insert a component snippet into the active editor
 */
async function insertComponentSnippet(component: ComponentInfo): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor to insert into");
    return;
  }

  // Build snippet with tabstops
  let snippet = `/${component.name}`;

  // Add required args as tabstops
  const requiredArgs = component.args.filter((a) => a.required);
  requiredArgs.forEach((arg, i) => {
    snippet += ` "\${${i + 1}:${arg.name}}"`;
  });

  // Add block if component accepts it
  if (component.hasBlock) {
    const tabIndex = requiredArgs.length + 1;
    snippet += ` {\n\t\${${tabIndex}}\n}`;
  }

  // Insert as snippet
  await editor.insertSnippet(new vscode.SnippetString(snippet));
}

/**
 * Show docs for the component under cursor
 */
export function showDocsForCurrentWord(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Get word under cursor
  const position = editor.selection.active;
  const line = editor.document.lineAt(position.line).text;

  // Look for /command pattern near cursor
  const commandRegex = /\/([a-zA-Z_-]+)/g;
  let match;
  while ((match = commandRegex.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (position.character >= start && position.character <= end) {
      const componentName = match[1];
      const components = loadComponents();
      const component = components.find((c) => c.name === componentName);
      if (component) {
        showComponentDocs(component, context);
        return;
      }
    }
  }

  // No component found, show search
  showComponentSearch(context);
}
