/**
 * Polyester VSCode Extension
 *
 * Provides language support for .poly files:
 * - Syntax highlighting (via TextMate grammar)
 * - LSP features (diagnostics, completions, hover)
 * - Document formatting with proper indentation
 * - Documentation browser and search
 */

import * as path from "path";
import * as vscode from "vscode";
import { exec } from "child_process";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

import { DocsTreeProvider, ComponentInfo } from "./docsTreeView";
import { showComponentDocs, showReferenceDocs, showCategoryDocs, disposePanel } from "./docsWebview";
import { ReferenceSection, CategorySection } from "./glossary";
import { showComponentSearch, showDocsForCurrentWord } from "./docsQuickPick";
import { openLivePreview, disposePreview } from "./livePreview";

let client: LanguageClient | undefined;
let docsTreeProvider: DocsTreeProvider | undefined;

/**
 * Count braces in a line, ignoring braces inside quoted strings.
 * Returns { open, close } counts.
 */
function countBraces(line: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const prevChar = i > 0 ? line[i - 1] : "";

    // Track string boundaries
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    // Only count braces outside strings
    if (!inString) {
      if (char === "{") open++;
      if (char === "}") close++;
    }
  }

  return { open, close };
}

/**
 * Format a Polyester document with proper indentation for nested blocks.
 * All content inside { } gets indented uniformly.
 */
function formatPolyesterDocument(document: vscode.TextDocument): vscode.TextEdit[] {
  const edits: vscode.TextEdit[] = [];
  const text = document.getText();
  const lines = text.split("\n");
  const indent = "  "; // 2 spaces per level
  let depth = 0;
  const formattedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty lines - preserve them
    if (trimmed === "") {
      formattedLines.push("");
      continue;
    }

    const braces = countBraces(trimmed);

    // Calculate indent: dedent if line starts with }
    const startsWithClose = trimmed.startsWith("}");
    const currentIndent = startsWithClose ? Math.max(0, depth - 1) : depth;

    // Apply indentation
    const formatted = indent.repeat(currentIndent) + trimmed;
    formattedLines.push(formatted);

    // Update depth after formatting this line
    depth += braces.open - braces.close;
    depth = Math.max(0, depth);
  }

  // Create a single edit that replaces the entire document
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(text.length)
  );
  const formattedText = formattedLines.join("\n");

  if (formattedText !== text) {
    edits.push(vscode.TextEdit.replace(fullRange, formattedText));
  }

  return edits;
}

/**
 * Document formatting provider for Polyester files.
 */
class PolyesterFormattingProvider implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.TextEdit[] {
    return formatPolyesterDocument(document);
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Get configuration
  const config = vscode.workspace.getConfiguration("polyester");
  let lspPath = config.get<string>("lspPath") || "";

  // If no custom path, use the polyester project's dist folder
  // __dirname is editors/vscode/out, so go up 3 levels to polyester/
  if (!lspPath) {
    lspPath = path.join(__dirname, "..", "..", "..", "dist", "lsp", "server.js");
  }

  // Server options - run with node using stdio
  const serverOptions: ServerOptions = {
    run: {
      command: "node",
      args: [lspPath, "--stdio"],
      transport: TransportKind.stdio,
    },
    debug: {
      command: "node",
      args: [lspPath, "--stdio"],
      transport: TransportKind.stdio,
    },
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "polyester" }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.poly"),
    },
  };

  // Create and start the client
  client = new LanguageClient(
    "polyester",
    "Polyester Language Server",
    serverOptions,
    clientOptions
  );

  // Start the client
  client.start().then(() => {
    console.log("Polyester LSP client started");
  }).catch((err) => {
    vscode.window.showWarningMessage(
      `Failed to start Polyester language server: ${err.message}. ` +
      `Make sure poly-lsp is installed and in your PATH, or set polyester.lspPath in settings.`
    );
  });

  // Create documentation tree provider
  docsTreeProvider = new DocsTreeProvider();
  const treeView = vscode.window.createTreeView("polyesterDocs", {
    treeDataProvider: docsTreeProvider,
    showCollapseAll: true,
  });

  // Register commands
  context.subscriptions.push(
    // Build commands
    vscode.commands.registerCommand("polyester.buildHtml", buildHtml),
    vscode.commands.registerCommand("polyester.buildPdf", buildPdf),

    // Documentation commands
    vscode.commands.registerCommand("polyester.searchComponents", () => {
      showComponentSearch(context);
    }),
    vscode.commands.registerCommand("polyester.showComponentDocs", (component: ComponentInfo) => {
      showComponentDocs(component, context);
    }),
    vscode.commands.registerCommand("polyester.showDocsAtCursor", () => {
      showDocsForCurrentWord(context);
    }),
    vscode.commands.registerCommand("polyester.refreshDocs", () => {
      docsTreeProvider?.refresh();
      vscode.window.showInformationMessage("Polyester documentation refreshed");
    }),
    vscode.commands.registerCommand("polyester.showReferenceDocs", (section: ReferenceSection) => {
      showReferenceDocs(section, context);
    }),
    vscode.commands.registerCommand("polyester.showCategoryDocs", (category: CategorySection) => {
      showCategoryDocs(category, context);
    }),

    // Live preview
    vscode.commands.registerCommand("polyester.openPreview", () => {
      openLivePreview(context);
    }),

    // Tree view
    treeView,

    // Document formatter
    vscode.languages.registerDocumentFormattingEditProvider(
      { scheme: "file", language: "polyester" },
      new PolyesterFormattingProvider()
    )
  );
}

export function deactivate(): Thenable<void> | undefined {
  disposePanel();
  disposePreview();
  if (!client) {
    return undefined;
  }
  return client.stop();
}

// Get CLI path from config or try to find it
function getCliPath(): string {
  const config = vscode.workspace.getConfiguration("polyester");
  const configPath = config.get<string>("cliPath");
  if (configPath) {
    return configPath;
  }

  // Try workspace folder first (for development)
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const candidate = path.join(folder.uri.fsPath, "dist", "cli", "index.js");
      try {
        require.resolve(candidate);
        return candidate;
      } catch {
        // Not found, continue
      }
    }
  }

  // Fallback: assume poly is in PATH
  return "poly";
}

/**
 * Run a build command silently and show notification on completion
 */
function runBuild(inputPath: string, outputPath: string, format: "html" | "pdf"): void {
  const cliPath = getCliPath();
  const formatArg = format === "pdf" ? " --format pdf" : "";
  // If cliPath is "poly", run directly; otherwise run with node
  const cmd = cliPath === "poly"
    ? `poly build "${inputPath}"${formatArg} -o "${outputPath}"`
    : `node "${cliPath}" build "${inputPath}"${formatArg} -o "${outputPath}"`;

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Building ${format.toUpperCase()}...`,
      cancellable: false,
    },
    () => {
      return new Promise<void>((resolve) => {
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            const errorMsg = stderr || error.message;
            vscode.window.showErrorMessage(`Build failed: ${errorMsg}`);
          } else {
            const fileName = path.basename(outputPath);
            vscode.window.showInformationMessage(`Built: ${fileName}`);
          }
          resolve();
        });
      });
    }
  );
}

/**
 * Build current document to HTML
 */
async function buildHtml() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "polyester") {
    vscode.window.showWarningMessage("Open a .poly file to build");
    return;
  }

  // Save the document first
  await editor.document.save();

  const inputPath = editor.document.uri.fsPath;
  const outputPath = inputPath.replace(/\.poly$/, ".html");
  runBuild(inputPath, outputPath, "html");
}

/**
 * Build current document to PDF
 */
async function buildPdf() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "polyester") {
    vscode.window.showWarningMessage("Open a .poly file to build");
    return;
  }

  // Save the document first
  await editor.document.save();

  const inputPath = editor.document.uri.fsPath;
  const outputPath = inputPath.replace(/\.poly$/, ".pdf");
  runBuild(inputPath, outputPath, "pdf");
}
