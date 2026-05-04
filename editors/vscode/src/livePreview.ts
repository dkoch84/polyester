/**
 * Live Preview
 *
 * Shows a live-updating preview of the current Polyester document.
 */

import * as vscode from "vscode";
import * as path from "path";
import { compile as compilePoly } from "./polyRuntime";

let previewPanel: vscode.WebviewPanel | undefined;
let updateTimeout: NodeJS.Timeout | undefined;
let extensionPath: string | undefined;

async function compileSource(source: string, sourceDir: string, title: string): Promise<string> {
  try {
    return await compilePoly(source, { sourceDir, title }, extensionPath);
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
async function updatePreview(document: vscode.TextDocument): Promise<void> {
  if (!previewPanel) return;
  if (document.languageId !== "polyester") return;

  const baseDir = path.dirname(document.uri.fsPath);
  const html = await compileSource(
    document.getText(),
    baseDir,
    path.basename(document.fileName, ".poly"),
  );
  if (!previewPanel) return;
  const enhancedHtml = html.replace(
    "</head>",
    `<base href="${previewPanel.webview.asWebviewUri(vscode.Uri.file(baseDir))}/">
    <style>
      /* Background for preview — page sim script overrides for paginated docs */
      html, body { background: var(--poly-preview-bg, white); }
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
  extensionPath = context.extensionPath;
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
