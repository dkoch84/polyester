/**
 * Documentation Webview Panel
 *
 * Shows detailed documentation for a Polyester component
 * in a rich HTML panel.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ComponentInfo } from "./docsTreeView";
import { ReferenceSection, GlossaryEntry, CategorySection } from "./glossary";
import {
  getComponentDescription,
  getFlagDescription,
  explainDefaultValue,
} from "./friendlyDescriptions";

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Show documentation for a component in a webview panel
 */
export function showComponentDocs(
  component: ComponentInfo,
  context: vscode.ExtensionContext
): void {
  if (currentPanel) {
    // Update existing panel - preserve its current position
    currentPanel.reveal();
    currentPanel.title = `/${component.name}`;
    currentPanel.webview.html = getWebviewContent(component);
  } else {
    // Create new panel beside the active editor
    const columnToShowIn = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;
    currentPanel = vscode.window.createWebviewPanel(
      "polyesterDocs",
      `/${component.name}`,
      columnToShowIn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    currentPanel.webview.html = getWebviewContent(component);

    // Handle messages from the webview
    currentPanel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "insert":
            insertSnippet(message.text);
            break;
          case "copy":
            vscode.env.clipboard.writeText(message.text);
            vscode.window.showInformationMessage("Copied to clipboard");
            break;
        }
      },
      undefined,
      context.subscriptions
    );

    // Clean up when panel is closed
    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
      },
      null,
      context.subscriptions
    );
  }
}

/**
 * Show a reference guide section in the webview
 */
export function showReferenceDocs(
  section: ReferenceSection,
  context: vscode.ExtensionContext
): void {
  // Load the compiled HTML file
  const htmlPath = path.join(__dirname, "reference", section.htmlFile);
  let htmlContent: string;

  try {
    htmlContent = fs.readFileSync(htmlPath, "utf-8");
  } catch {
    // Fallback to generated content if file not found
    htmlContent = getReferenceWebviewContent(section);
  }

  if (currentPanel) {
    // Preserve current position
    currentPanel.reveal();
    currentPanel.title = section.title;
    currentPanel.webview.html = htmlContent;
  } else {
    const columnToShowIn = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;
    currentPanel = vscode.window.createWebviewPanel(
      "polyesterDocs",
      section.title,
      columnToShowIn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    currentPanel.webview.html = htmlContent;

    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
      },
      null,
      context.subscriptions
    );
  }
}

/**
 * Show a category overview in the webview
 */
export function showCategoryDocs(
  category: CategorySection,
  context: vscode.ExtensionContext
): void {
  // Load the compiled HTML file
  const htmlPath = path.join(__dirname, "reference", category.htmlFile);
  let htmlContent: string;

  try {
    htmlContent = fs.readFileSync(htmlPath, "utf-8");
  } catch {
    // Fallback message if file not found
    htmlContent = `<!DOCTYPE html>
<html><head><title>${category.title}</title></head>
<body style="padding: 20px; font-family: system-ui;">
<h1>${category.title}</h1>
<p>Category overview not found. Please rebuild the reference files.</p>
<p>Run: <code>cd editors/vscode && node scripts/build-reference.js</code></p>
</body></html>`;
  }

  if (currentPanel) {
    // Preserve current position
    currentPanel.reveal();
    currentPanel.title = category.title;
    currentPanel.webview.html = htmlContent;
  } else {
    const columnToShowIn = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;
    currentPanel = vscode.window.createWebviewPanel(
      "polyesterDocs",
      category.title,
      columnToShowIn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    currentPanel.webview.html = htmlContent;

    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
      },
      null,
      context.subscriptions
    );
  }
}

/**
 * Insert a snippet into the active editor
 */
async function insertSnippet(text: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor to insert into");
    return;
  }

  await editor.edit((editBuilder) => {
    editBuilder.insert(editor.selection.active, text);
  });

  // Focus back to editor
  vscode.window.showTextDocument(editor.document);
}

/**
 * Add tooltip for a default value with unit explanation
 */
function formatDefaultValue(value: string): string {
  const explanation = explainDefaultValue(value);
  if (explanation) {
    return `<span class="default" title="${escapeHtml(explanation)}">default: ${escapeHtml(value)} <span class="tooltip-hint">(?)</span></span>`;
  }
  return `<span class="default">default: ${escapeHtml(value)}</span>`;
}

/**
 * Generate HTML content for the webview with two-column code/result style
 */
function getWebviewContent(component: ComponentInfo): string {
  // Get friendly component description if available
  const friendlyComp = getComponentDescription(component.name);
  const description = friendlyComp?.friendly || component.description;
  const visualDesc = friendlyComp?.visualDescription;

  // Generate example code for the left panel
  const exampleCode = component.examples.length > 0
    ? component.examples[0]
    : `/${component.name}${component.hasBlock ? " {\n  content here\n}" : ""}`;

  // Build flags documentation
  const flagsHtml = component.flags
    .map((f) => {
      const short = f.short ? `-${f.short}, ` : "";
      const val = f.hasValue ? " <value>" : "";
      const def = f.default ? ` <span class="flag-default">(default: ${escapeHtml(f.default)})</span>` : "";
      const vals = f.values ? `<span class="flag-values">${f.values.join(" | ")}</span>` : "";

      const friendlyFlag = getFlagDescription(component.name, f.name);
      const flagDesc = friendlyFlag?.friendly || f.description;

      return `
        <div class="flag-item">
          <code class="flag-name">${short}--${escapeHtml(f.name)}${val}</code>${def}
          <div class="flag-desc">${escapeHtml(flagDesc)} ${vals}</div>
        </div>
      `;
    })
    .join("");

  // Build args documentation
  const argsHtml = component.args
    .map((a) => {
      const req = a.required ? '<span class="required">*required</span>' : "";
      const def = a.default ? ` <span class="flag-default">(default: ${escapeHtml(a.default)})</span>` : "";
      return `
        <div class="flag-item">
          <code class="flag-name">${escapeHtml(a.name)}</code> ${req}${def}
          <div class="flag-desc">${escapeHtml(a.description)}</div>
        </div>
      `;
    })
    .join("");

  const blockInfo = component.hasBlock
    ? '<span class="badge badge-block">{ } block</span>'
    : '<span class="badge badge-inline">inline</span>';

  const categoryColors: Record<string, string> = {
    layout: "#3b82f6",
    content: "#10b981",
    style: "#8b5cf6",
    interactive: "#f59e0b",
  };
  const catColor = categoryColors[component.category] || "#64748b";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>/${component.name}</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --accent: var(--vscode-textLink-foreground);
      --border: var(--vscode-panel-border);
      --code-bg: var(--vscode-textCodeBlock-background);
      --button-bg: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
    }

    * { box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      margin: 0;
      padding: 0;
      line-height: 1.6;
    }

    .header {
      background: linear-gradient(135deg, ${catColor}, ${catColor}cc);
      padding: 1.5rem;
      color: white;
    }

    .header h1 {
      margin: 0;
      font-size: 1.8em;
    }

    .header .desc {
      opacity: 0.9;
      margin-top: 0.25rem;
    }

    .badges {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }

    .badge {
      display: inline-block;
      padding: 0.2em 0.6em;
      font-size: 0.75em;
      border-radius: 4px;
      background: rgba(255,255,255,0.2);
    }

    .two-column {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: 200px;
    }

    .code-panel {
      background: #1e1e1e;
      padding: 1rem;
      display: flex;
      flex-direction: column;
    }

    .code-panel pre {
      margin: 0;
      flex: 1;
      overflow: auto;
    }

    .code-panel code {
      font-family: var(--vscode-editor-font-family);
      font-size: 13px;
      color: #e6e6e6;
      white-space: pre-wrap;
    }

    .code-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #333;
    }

    .result-panel {
      padding: 1.5rem;
      background: #f8fafc;
      color: #1e293b;
    }

    .section-title {
      font-size: 0.85em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${catColor};
      margin: 0 0 0.75rem 0;
    }

    .flag-item {
      margin-bottom: 0.75rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .flag-item:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .flag-name {
      font-weight: 600;
      color: #3b82f6;
      background: #e2e8f0;
      padding: 0.1em 0.4em;
      border-radius: 3px;
    }

    .flag-desc {
      font-size: 0.9em;
      color: #475569;
      margin-top: 0.25rem;
    }

    .flag-default {
      font-size: 0.85em;
      color: #64748b;
    }

    .flag-values {
      display: block;
      font-size: 0.8em;
      font-family: var(--vscode-editor-font-family);
      color: #64748b;
      margin-top: 0.25rem;
    }

    .required {
      color: #ef4444;
      font-size: 0.75em;
    }

    button {
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      padding: 0.4em 0.8em;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8em;
    }

    button:hover { opacity: 0.9; }

    .more-examples {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #e2e8f0;
    }

    .example-item {
      background: #1e1e1e;
      border-radius: 6px;
      margin: 0.5rem 0;
      overflow: hidden;
    }

    .example-item pre {
      margin: 0;
      padding: 0.75rem;
      font-size: 0.85em;
    }

    .example-item code {
      color: #e6e6e6;
    }

    .example-actions {
      display: flex;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #282828;
      border-top: 1px solid #333;
    }

    .visual-hint {
      font-style: italic;
      color: #475569;
      margin-bottom: 1rem;
      padding: 0.75rem;
      background: #eff6ff;
      border-radius: 6px;
      border-left: 3px solid ${catColor};
    }

    .no-items {
      color: #64748b;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>/${escapeHtml(component.name)}</h1>
    <div class="desc">${escapeHtml(description)}</div>
    <div class="badges">
      <span class="badge">${component.category}</span>
      ${blockInfo}
    </div>
  </div>

  <div class="two-column">
    <div class="code-panel">
      <pre><code>${escapeHtml(exampleCode)}</code></pre>
      <div class="code-actions">
        <button onclick="copyExample('${escapeJs(exampleCode)}')">Copy</button>
        <button onclick="insertExample('${escapeJs(exampleCode)}')">Insert</button>
      </div>
    </div>

    <div class="result-panel">
      ${visualDesc ? `<div class="visual-hint">${escapeHtml(visualDesc)}</div>` : ''}

      ${argsHtml ? `
        <div class="section-title">Arguments</div>
        ${argsHtml}
      ` : ''}

      ${flagsHtml ? `
        <div class="section-title" style="margin-top: 1.5rem;">Flags</div>
        ${flagsHtml}
      ` : ''}

      ${!argsHtml && !flagsHtml ? '<p class="no-items">No arguments or flags</p>' : ''}

      ${component.examples.length > 1 ? `
        <div class="more-examples">
          <div class="section-title">More Examples</div>
          ${component.examples.slice(1).map((ex) => `
            <div class="example-item">
              <pre><code>${escapeHtml(ex)}</code></pre>
              <div class="example-actions">
                <button onclick="copyExample('${escapeJs(ex)}')">Copy</button>
                <button onclick="insertExample('${escapeJs(ex)}')">Insert</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function copyExample(text) {
      vscode.postMessage({ command: 'copy', text: text });
    }

    function insertExample(text) {
      vscode.postMessage({ command: 'insert', text: text });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n");
}

/**
 * Generate HTML content for a reference guide section
 */
function getReferenceWebviewContent(section: ReferenceSection): string {
  const entries = section.entries
    .map((entry: GlossaryEntry) => `
      <div class="ref-entry">
        <div class="ref-term">
          <span class="term-name">${escapeHtml(entry.term)}</span>
          <span class="term-short">${escapeHtml(entry.short)}</span>
        </div>
        <p class="ref-full">${escapeHtml(entry.full)}</p>
        ${entry.designerAnalogy ? `<p class="ref-analogy">💡 ${escapeHtml(entry.designerAnalogy)}</p>` : ''}
        ${entry.example ? `<p class="ref-example"><strong>Examples:</strong> ${escapeHtml(entry.example)}</p>` : ''}
      </div>
    `)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(section.title)}</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --accent: var(--vscode-textLink-foreground);
      --border: var(--vscode-panel-border);
      --code-bg: var(--vscode-textCodeBlock-background);
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
      padding: 20px;
      line-height: 1.6;
    }

    h1 {
      font-size: 1.6em;
      margin: 0 0 0.5rem 0;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .subtitle {
      opacity: 0.8;
      margin-bottom: 1.5rem;
    }

    .ref-entry {
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: var(--code-bg);
      border-radius: 8px;
      border-left: 3px solid var(--accent);
    }

    .ref-term {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .term-name {
      font-weight: 600;
      font-size: 1.1em;
      color: var(--accent);
    }

    .term-short {
      opacity: 0.7;
      font-size: 0.9em;
    }

    .ref-full {
      margin: 0 0 0.5rem 0;
    }

    .ref-analogy {
      margin: 0.5rem 0;
      padding: 0.5rem 0.75rem;
      background: rgba(255, 200, 0, 0.1);
      border-radius: 4px;
      font-size: 0.9em;
    }

    .ref-example {
      margin: 0.5rem 0 0 0;
      font-size: 0.9em;
      opacity: 0.9;
    }

    .back-link {
      display: inline-block;
      margin-bottom: 1rem;
      color: var(--accent);
      text-decoration: none;
      opacity: 0.8;
    }

    .back-link:hover {
      opacity: 1;
    }
  </style>
</head>
<body>
  <h1>📖 ${escapeHtml(section.title)}</h1>
  <p class="subtitle">Designer-friendly explanations with comparisons to tools like Illustrator and InDesign.</p>

  ${entries}
</body>
</html>`;
}

/**
 * Dispose the current panel if it exists
 */
export function disposePanel(): void {
  if (currentPanel) {
    currentPanel.dispose();
  }
}
