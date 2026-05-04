/**
 * Programmatic build API
 *
 * Compiles a Polyester source string to an HTML document. Mirrors the flow
 * used by `poly build` so the VS Code extension can call it in-process.
 */

import { basename } from "node:path";
import { parse } from "./parser/parser.js";
import { compileToHtml } from "./backends/html/compiler.js";
import {
  resolveModules,
  styleToCSS,
  spacingToCSS,
  syntaxToCSS,
} from "./themes/loader.js";
import { loadConfig } from "./config/index.js";

export interface CompileDocOptions {
  /** Directory of the source file — used to resolve relative /import paths. */
  sourceDir?: string;
  /** Title for the standalone document (defaults to "Untitled"). */
  title?: string;
  /** Override theme selection. */
  theme?: string;
  /** Override style preset. */
  style?: string;
  /** Override spacing preset. */
  spacing?: string;
}

/**
 * Compile a Polyester source string to a full standalone HTML document.
 *
 * Replicates the two-pass compile used by the CLI: first to extract `/page`
 * settings (theme/style/spacing), then with the resolved module CSS applied.
 */
export function compilePolyDocument(source: string, opts: CompileDocOptions = {}): string {
  const config = loadConfig();
  const ast = parse(source);

  const initial = compileToHtml(ast, { standalone: false, sourceDir: opts.sourceDir });
  const ps = initial.pageSettings;

  const resolved = resolveModules({
    theme: opts.theme || ps.theme || config.defaultTheme,
    style: opts.style || ps.style,
    spacing: opts.spacing || ps.spacing,
  });

  const styleCss = styleToCSS(resolved.style);
  const spacingCss = spacingToCSS(resolved.spacing);
  const syntaxCss = syntaxToCSS(resolved.syntax, resolved.name);

  const { html } = compileToHtml(ast, {
    standalone: true,
    title: opts.title || "Untitled",
    sourceDir: opts.sourceDir,
    styleCss,
    spacingCss,
    syntaxCss,
  });

  return html;
}
