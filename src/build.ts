/**
 * Programmatic build API
 *
 * Compiles a Polyester source string to an HTML document. Mirrors the flow
 * used by `poly build` so the VS Code extension can call it in-process.
 */

import { basename } from "node:path";
import { parse } from "./parser/parser.js";
import { compileToHtml } from "./backends/html/compiler.js";
import { prefetchFonts } from "./backends/html/fonts.js";
import {
  resolveModules,
  styleToCSS,
  spacingToCSS,
  syntaxToCSS,
} from "./themes/loader.js";
import { loadConfig } from "./config/index.js";
import { assertNoErrors } from "./diagnostics.js";

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
 *
 * Throws {@link PolyBuildError} if the document has errors (unknown commands,
 * unresolvable fonts). Nothing is returned in that case: a document that
 * silently degrades to fallback fonts is not a successful build.
 */
export async function compilePolyDocument(source: string, opts: CompileDocOptions = {}): Promise<string> {
  const config = loadConfig();
  const ast = parse(source);

  // Resolve /font references (Google Fonts fetched + cached, local files read)
  // before compile so the sync component can emit inlined @font-face blocks.
  const { cache: fontCache, diagnostics: fontDiagnostics } = await prefetchFonts(
    ast,
    opts.sourceDir || process.cwd(),
  );

  // Probe pass: only its pageSettings are used. Its diagnostics are discarded
  // because the final pass produces the same ones, and reporting both is what
  // made every warning appear twice.
  const initial = compileToHtml(ast, { standalone: false, sourceDir: opts.sourceDir, fontCache });
  const ps = initial.pageSettings;

  const resolved = resolveModules({
    theme: opts.theme || ps.theme || config.defaultTheme,
    style: opts.style || ps.style,
    spacing: opts.spacing || ps.spacing,
  });

  const styleCss = styleToCSS(resolved.style);
  const spacingCss = spacingToCSS(resolved.spacing);
  const syntaxCss = syntaxToCSS(resolved.syntax, resolved.name);

  const { html, diagnostics } = compileToHtml(ast, {
    standalone: true,
    title: opts.title || "Untitled",
    sourceDir: opts.sourceDir,
    styleCss,
    spacingCss,
    syntaxCss,
    fontCache,
  });

  // Throws PolyBuildError on any error, so a document that references a font
  // or command it cannot resolve never reaches the caller as "successful" HTML.
  assertNoErrors([
    ...fontDiagnostics,
    ...diagnostics,
  ]);

  return html;
}
