/**
 * Build diagnostics.
 *
 * Components and the font prefetcher report problems here instead of writing
 * to the console as they render. Two reasons:
 *
 * 1. Every build path compiles the document twice (a probe pass to read
 *    /page settings, then the real pass). Warnings printed during rendering
 *    therefore appeared twice for every problem.
 * 2. A collected list can be inspected before anything is written, so a
 *    document that references a font it cannot load fails the build instead
 *    of quietly rendering in fallback fonts and reporting success.
 */

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  /** 1-based source line, when the reporting node carries a location. */
  line?: number;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/** Render diagnostics one per line, errors first, for terminal output. */
export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  const rank = (d: Diagnostic) => (d.severity === "error" ? 0 : 1);
  return [...diagnostics]
    .sort((a, b) => rank(a) - rank(b) || (a.line ?? 0) - (b.line ?? 0))
    .map((d) => {
      const mark = d.severity === "error" ? "✗" : "⚠";
      const where = d.line ? ` (line ${d.line})` : "";
      return `${mark} ${d.message}${where}`;
    })
    .join("\n");
}

/**
 * Thrown when a build produced errors. Carries the full diagnostic list so
 * callers can render it however they like; `message` is already formatted for
 * a terminal, so a plain `catch (err) { console.error(err.message) }` reads
 * correctly.
 */
export class PolyBuildError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const noun = errorCount === 1 ? "error" : "errors";
    super(`Build failed with ${errorCount} ${noun}:\n${formatDiagnostics(diagnostics)}`);
    this.name = "PolyBuildError";
    this.diagnostics = diagnostics;
  }
}

/** Throw if any diagnostic is an error; otherwise print the warnings. */
export function assertNoErrors(diagnostics: readonly Diagnostic[]): void {
  if (hasErrors(diagnostics)) {
    throw new PolyBuildError(diagnostics);
  }
  if (diagnostics.length) {
    console.warn(formatDiagnostics(diagnostics));
  }
}
