#!/usr/bin/env node

/**
 * Polyester Language Server
 *
 * Provides IDE features for .poly files:
 * - Diagnostics (parse errors, unknown commands)
 * - Autocomplete (commands, flags)
 * - Hover information
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  Hover,
  MarkupKind,
  Diagnostic,
  DiagnosticSeverity,
  Position,
} from "vscode-languageserver/node.js";

import { TextDocument } from "vscode-languageserver-textdocument";
import { parse, ParseError } from "../parser/parser.js";
import { COMMAND_DOCS, getCommandCompletions, getFlagCompletions, getCommandHoverDoc } from "./completions.js";

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all);

// Document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ["/", "-", " "],
        resolveProvider: false,
      },
      hoverProvider: true,
    },
  };
});

// Validate document on open and change
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

/**
 * Validate a document and send diagnostics
 */
function validateDocument(document: TextDocument): void {
  const text = document.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    // Try to parse the document
    const ast = parse(text);

    // Check for unknown commands
    for (const node of ast.children) {
      if (node.type === "command") {
        if (!COMMAND_DOCS[node.name]) {
          // Use location if available
          let range = {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          };

          if (node.loc) {
            range = {
              start: { line: node.loc.start.line - 1, character: node.loc.start.column - 1 },
              end: { line: node.loc.end.line - 1, character: node.loc.end.column - 1 },
            };
          }

          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range,
            message: `Unknown command: /${node.name}`,
            source: "polyester",
          });
        }
      }
    }
  } catch (err) {
    if (err instanceof ParseError) {
      // Convert parse error to diagnostic
      let range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      };

      if (err.loc) {
        range = {
          start: { line: err.loc.start.line - 1, character: err.loc.start.column - 1 },
          end: { line: err.loc.end.line - 1, character: err.loc.end.column },
        };
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: err.message,
        source: "polyester",
      });
    } else {
      // Unknown error
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: `Parse error: ${(err as Error).message}`,
        source: "polyester",
      });
    }
  }

  // Send diagnostics to client
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

/**
 * Provide completions
 */
connection.onCompletion((params): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const offset = document.offsetAt(params.position);

  // Get current line up to cursor
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineText = text.slice(lineStart, offset);

  // Check if we're after a command and should suggest flags
  const commandMatch = lineText.match(/^(\s*)\/(\w+)\s+(.*)$/);
  if (commandMatch) {
    const commandName = commandMatch[2];
    const afterCommand = commandMatch[3];

    // If typing a flag (starts with -)
    if (afterCommand.match(/-\w*$/)) {
      return getFlagCompletions(commandName);
    }
  }

  // Check if starting a command (line starts with / or just typed /)
  if (lineText.match(/^\s*\/?$/) || lineText.endsWith("/")) {
    return getCommandCompletions();
  }

  return [];
});

/**
 * Provide hover information
 */
connection.onHover((params): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);

  // Find if we're hovering over a command
  // Look backward and forward for command boundaries
  let start = offset;
  let end = offset;

  // Find start of potential command
  while (start > 0 && text[start - 1] !== "/" && text[start - 1] !== "\n") {
    start--;
  }

  // Check if this is a command
  if (start > 0 && text[start - 1] === "/") {
    start--; // Include the /

    // Find end of command name
    end = start + 1;
    while (end < text.length && /\w/.test(text[end])) {
      end++;
    }

    const commandText = text.slice(start, end);
    const match = commandText.match(/^\/(\w+)$/);

    if (match) {
      const commandName = match[1];
      const hoverDoc = getCommandHoverDoc(commandName);

      if (hoverDoc) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `### /${commandName}\n\n${hoverDoc}`,
          },
        };
      }
    }
  }

  return null;
});

// Start listening
documents.listen(connection);
connection.listen();
