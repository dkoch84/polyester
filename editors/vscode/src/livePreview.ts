/**
 * Live Preview
 *
 * Shows a live-updating preview of the current Polyester document.
 */

import * as vscode from "vscode";
import * as path from "path";
import { execSync } from "child_process";

let previewPanel: vscode.WebviewPanel | undefined;
let updateTimeout: NodeJS.Timeout | undefined;

/**
 * Get CLI path from config or workspace
 */
function getCliPath(): string {
  const config = vscode.workspace.getConfiguration("polyester");
  const configPath = config.get<string>("cliPath");
  if (configPath) {
    return configPath;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const candidate = path.join(folder.uri.fsPath, "dist", "cli", "index.js");
      try {
        require.resolve(candidate);
        return candidate;
      } catch {
        // Not found
      }
    }
  }

  const extensionPath = path.join(__dirname, "..", "..", "..", "dist", "cli", "index.js");
  try {
    require.resolve(extensionPath);
    return extensionPath;
  } catch {
    // Not found
  }

  return "poly";
}

/**
 * Compile a .poly file to HTML string
 */
function compileToHtml(filePath: string): string {
  try {
    const cliPath = getCliPath();
    const cmd = cliPath === "poly"
      ? `poly build "${filePath}" -o -`
      : `node "${cliPath}" build "${filePath}" -o -`;

    // For now, build to temp file and read it
    const tempOut = `/tmp/poly-preview-${Date.now()}.html`;
    const buildCmd = cliPath === "poly"
      ? `poly build "${filePath}" -o "${tempOut}"`
      : `node "${cliPath}" build "${filePath}" -o "${tempOut}"`;

    execSync(buildCmd, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const fs = require("fs");
    const html = fs.readFileSync(tempOut, "utf-8");
    fs.unlinkSync(tempOut);
    return html;
  } catch (err: any) {
    return `<html><body style="font-family: system-ui; padding: 2rem; color: #ef4444;">
      <h2>Build Error</h2>
      <pre style="background: #1e1e1e; color: #e5e5e5; padding: 1rem; border-radius: 4px; overflow: auto;">${escapeHtml(err.message || String(err))}</pre>
    </body></html>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Update the preview panel with current document content
 */
function updatePreview(document: vscode.TextDocument): void {
  if (!previewPanel) return;
  if (document.languageId !== "polyester") return;

  // Save to temp file and compile
  const fs = require("fs");
  const tempFile = `/tmp/poly-preview-src-${Date.now()}.poly`;
  fs.writeFileSync(tempFile, document.getText());

  const html = compileToHtml(tempFile);
  fs.unlinkSync(tempFile);

  // Inject base tag for relative resources and scroll preservation script
  const baseDir = path.dirname(document.uri.fsPath);
  const enhancedHtml = html.replace(
    "</head>",
    `<base href="${previewPanel.webview.asWebviewUri(vscode.Uri.file(baseDir))}/">
    <style>
      /* Ensure white background for preview */
      html, body { background: white; }
    </style>
    <script>
      // Preserve scroll position on reload
      const vscode = acquireVsCodeApi();
      const state = vscode.getState() || { scroll: 0 };
      window.scrollTo(0, state.scroll);
      window.addEventListener('scroll', () => {
        vscode.setState({ scroll: window.scrollY });
      });
    </script>
    </head>`
  );

  previewPanel.webview.html = enhancedHtml;
}

/**
 * Debounced update - waits for typing to pause
 */
function scheduleUpdate(document: vscode.TextDocument): void {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = setTimeout(() => {
    updatePreview(document);
  }, 300); // 300ms debounce
}

/**
 * Open or focus the live preview panel
 */
export function openLivePreview(context: vscode.ExtensionContext): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "polyester") {
    vscode.window.showWarningMessage("Open a .poly file to preview");
    return;
  }

  const document = editor.document;

  if (previewPanel) {
    previewPanel.reveal(vscode.ViewColumn.Beside);
    updatePreview(document);
    return;
  }

  // Create new panel
  previewPanel = vscode.window.createWebviewPanel(
    "polyesterPreview",
    "Preview: " + path.basename(document.fileName),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.dirname(document.uri.fsPath)),
        vscode.Uri.file(path.join(context.extensionPath, "..", "..")),
      ],
    }
  );

  // Initial render
  updatePreview(document);

  // Update on document change
  const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document === document) {
      scheduleUpdate(document);
    }
  });

  // Update when switching to a different .poly file
  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && editor.document.languageId === "polyester" && previewPanel) {
      previewPanel.title = "Preview: " + path.basename(editor.document.fileName);
      updatePreview(editor.document);
    }
  });

  // Clean up
  previewPanel.onDidDispose(() => {
    previewPanel = undefined;
    changeListener.dispose();
    editorChangeListener.dispose();
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
  });

  context.subscriptions.push(changeListener, editorChangeListener);
}

/**
 * Dispose the preview panel
 */
export function disposePreview(): void {
  if (previewPanel) {
    previewPanel.dispose();
  }
}
