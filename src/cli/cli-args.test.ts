import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Task 676: an unrecognised option used to fall off the end of the parser's
 * if/else chain and be discarded in silence, so `poly build doc.poly --pdf`
 * wrote HTML, printed a success line and exited 0.
 *
 * Driven through the built CLI rather than by unit-testing the parser, because
 * the defect was in observable behaviour: the exit code and what landed on
 * disk. A parser test would have passed against a build that still wrote the
 * wrong file.
 */

const CLI = resolve(__dirname, "..", "..", "dist", "cli", "index.js");

/** Run the CLI, returning exit status and stderr rather than throwing. */
function runCli(args: string[]): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8", stdio: "pipe" });
    return { status: 0, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stderr?: string };
    return { status: e.status ?? -1, stderr: e.stderr ?? "" };
  }
}

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "poly-cli-"));
  const file = join(dir, "doc.poly");
  writeFileSync(file, "/page A4\n\n# Heading\n\nBody.\n");
  return file;
}

// dist is what `poly` actually is; skip rather than fail in a tree that has not
// been built, so the suite stays runnable from a fresh checkout.
describe.skipIf(!existsSync(CLI))("cli option handling", () => {
  it("rejects an unknown option instead of ignoring it", () => {
    const { status, stderr } = runCli(["build", fixture(), "--pdf"]);
    expect(status).toBe(1);
    expect(stderr).toContain('unknown option: "--pdf"');
  });

  it("names the correct form when the option is a recognisable guess", () => {
    const { stderr } = runCli(["build", fixture(), "--pdf"]);
    expect(stderr).toContain("Did you mean --format pdf?");
  });

  it("lists the valid options so the message is actionable", () => {
    const { stderr } = runCli(["build", fixture(), "--thmee", "gruvbox"]);
    expect(stderr).toContain("--format");
    expect(stderr).toContain("--theme");
  });

  it("writes no output file for a rejected invocation", () => {
    // The original failure was survivable-looking precisely because a file
    // appeared: a stale .pdf from an earlier run made it look like a no-op.
    const src = fixture();
    runCli(["build", src, "--pdf"]);
    expect(existsSync(src.replace(/\.poly$/, ".html"))).toBe(false);
    expect(existsSync(src.replace(/\.poly$/, ".pdf"))).toBe(false);
  });

  it("still accepts the documented options", () => {
    const src = fixture();
    const out = src.replace(/\.poly$/, ".html");
    const { status } = runCli(["build", src, "--format", "html", "-o", out]);
    expect(status).toBe(0);
    expect(existsSync(out)).toBe(true);
  });
});
