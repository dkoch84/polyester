/**
 * Option-object validation for the public API.
 *
 * TypeScript rejects an unknown key on an object literal, but nothing catches
 * one built dynamically, and nothing at all catches a JavaScript caller. An
 * ignored option is the same failure as an ignored flag: the call succeeds,
 * reports nothing, and does something other than what was asked. Compiling with
 * `{ standalone: false }` against an interface that has no such key returned a
 * standalone document and said nothing.
 */

export function assertKnownOptions(
  opts: object,
  known: readonly string[],
  context: string,
): void {
  const unknown = Object.keys(opts).filter((key) => !known.includes(key));
  if (unknown.length === 0) return;

  const named = unknown.map((key) => `"${key}"`).join(", ");
  const noun = unknown.length === 1 ? "option" : "options";
  throw new Error(
    `Unknown ${noun} for ${context}: ${named}. Valid options: ${[...known].sort().join(", ")}.`,
  );
}
