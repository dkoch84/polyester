import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  themeRoots,
  findModuleFile,
  loadStyle,
  resolveTheme,
  listThemes,
  ThemeError,
} from "./loader.js";
import { extractTheme, adoptTheme } from "./extract.js";
import { DEFAULT_STYLE } from "./types.js";

let root: string;
const savedPath = process.env.POLY_THEME_PATH;

/** A search root with the three module directories. */
function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "poly-themes-"));
  for (const kind of ["themes", "styles", "spacing"]) {
    mkdirSync(join(dir, kind), { recursive: true });
  }
  return dir;
}

beforeEach(() => {
  root = makeRoot();
  process.env.POLY_THEME_PATH = root;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (savedPath === undefined) delete process.env.POLY_THEME_PATH;
  else process.env.POLY_THEME_PATH = savedPath;
});

describe("theme search path", () => {
  it("puts POLY_THEME_PATH entries ahead of the config directory", () => {
    const roots = themeRoots();
    expect(roots[0]).toBe(root);
    expect(roots[roots.length - 1]).toContain(".config");
  });

  it("finds a flat style file on the path", () => {
    writeFileSync(
      join(root, "styles", "housestyle.json"),
      JSON.stringify({ ...DEFAULT_STYLE, name: "housestyle", colors: { ...DEFAULT_STYLE.colors, primary: "#abcdef" } }),
    );
    expect(findModuleFile("styles", "housestyle")).toBe(join(root, "styles", "housestyle.json"));
    expect(loadStyle("housestyle").colors.primary).toBe("#abcdef");
  });

  it("lets a file on the path shadow a built-in", () => {
    // Built-ins used to win, so overriding a shipped style meant deleting it
    // from starters.ts. Disk wins now.
    expect(loadStyle("corporate").colors.primary).not.toBe("#ff0000");
    writeFileSync(
      join(root, "styles", "corporate.json"),
      JSON.stringify({ ...DEFAULT_STYLE, name: "corporate", colors: { ...DEFAULT_STYLE.colors, primary: "#ff0000" } }),
    );
    expect(loadStyle("corporate").colors.primary).toBe("#ff0000");
  });

  it("still errors for a name that is nowhere on the path", () => {
    expect(() => loadStyle("nowhere")).toThrow(ThemeError);
  });
});

describe("directory-form themes", () => {
  function writeDirTheme(name: string, extra: Record<string, unknown> = {}, css?: string) {
    const dir = join(root, "themes", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "theme.json"), JSON.stringify({ name, ...extra }));
    if (css !== undefined) writeFileSync(join(dir, "theme.css"), css);
    return dir;
  }

  it("resolves theme.json inside a directory", () => {
    const dir = writeDirTheme("housestyle");
    expect(findModuleFile("themes", "housestyle")).toBe(join(dir, "theme.json"));
    expect(resolveTheme("housestyle").name).toBe("housestyle");
    expect(listThemes()).toContain("housestyle");
  });

  it("carries theme.css and the theme directory", () => {
    const dir = writeDirTheme("housestyle", {}, ".mast { border-bottom: 2px solid black; }");
    const resolved = resolveTheme("housestyle");
    expect(resolved.dir).toBe(dir);
    expect(resolved.css).toContain(".mast");
  });

  it("carries font face declarations", () => {
    writeDirTheme("housestyle", {
      fonts: [{ family: "Archivo", src: "fonts/archivo.woff2", weight: "700" }],
    });
    expect(resolveTheme("housestyle").fonts).toEqual([
      { family: "Archivo", src: "fonts/archivo.woff2", weight: "700" },
    ]);
  });

  it("prefers the directory form over a flat file of the same name", () => {
    writeFileSync(join(root, "themes", "housestyle.json"), JSON.stringify({ name: "flat" }));
    writeDirTheme("housestyle", {}, "/* dir form */");
    expect(resolveTheme("housestyle").css).toContain("dir form");
  });
});

describe("theme extraction", () => {
  /** A miniature document project: a polystyle, a font file, and a .poly. */
  function makeProject(): { dir: string; doc: string } {
    const dir = mkdtempSync(join(tmpdir(), "poly-project-"));
    writeFileSync(
      join(dir, "look.polystyle"),
      JSON.stringify({
        name: "look",
        category: "themes",
        css: ":root{--ink:#131820;--poly-color-text:#131820;--poly-font-body:\"Archivo\",sans-serif}\n.mast{border-bottom:2px solid var(--ink)}",
      }),
    );
    writeFileSync(join(dir, "face.woff2"), "not-a-real-font");
    const doc = join(dir, "report.poly");
    writeFileSync(
      doc,
      [
        "/page --pageless --margin 1.4cm",
        '/font "Archivo" --src "face.woff2" --weight 700',
        '/import "./look.polystyle"',
        "",
        "# Heading",
        "",
        "Body text.",
        "",
      ].join("\n"),
    );
    return { dir, doc };
  }

  it("maps --poly-* tokens, copies the rest of the CSS verbatim, and carries fonts", () => {
    const { dir, doc } = makeProject();
    const outDir = join(root, "themes", "look");

    const result = extractTheme({ documentPath: doc, name: "look", outDir });

    expect(result.mappedTokens).toEqual(["--poly-color-text", "--poly-font-body"]);
    expect(result.fonts).toEqual([
      { family: "Archivo", src: "fonts/face.woff2", weight: "700" },
    ]);
    expect(existsSync(join(outDir, "fonts", "face.woff2"))).toBe(true);

    const theme = JSON.parse(readFileSync(join(outDir, "theme.json"), "utf-8"));
    expect(theme.style.colors.text).toBe("#131820");
    expect(theme.style.fonts.body).toBe('"Archivo",sans-serif');

    // A converter cannot know what --ink means, so it stays CSS rather than
    // being guessed into a token.
    const css = readFileSync(join(outDir, "theme.css"), "utf-8");
    expect(css).toContain("--ink:#131820");
    expect(css).toContain(".mast{border-bottom:2px solid var(--ink)}");

    rmSync(dir, { recursive: true, force: true });
  });

  it("produces a theme the loader can resolve and use", () => {
    const { dir, doc } = makeProject();
    extractTheme({ documentPath: doc, name: "look", outDir: join(root, "themes", "look") });

    const resolved = resolveTheme("look");
    expect(resolved.style.colors.text).toBe("#131820");
    expect(resolved.css).toContain(".mast");
    expect(resolved.fonts?.[0].family).toBe("Archivo");

    rmSync(dir, { recursive: true, force: true });
  });

  it("--adopt drops the setup lines and puts the theme on /page", () => {
    const { dir, doc } = makeProject();
    extractTheme({
      documentPath: doc,
      name: "look",
      outDir: join(root, "themes", "look"),
      adopt: true,
    });

    const rewritten = readFileSync(doc, "utf-8");
    expect(rewritten).toContain("/page --pageless --margin 1.4cm --theme look");
    expect(rewritten).not.toContain("/font");
    expect(rewritten).not.toContain("/import");
    // Content is untouched.
    expect(rewritten).toContain("# Heading");
    expect(rewritten).toContain("Body text.");

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("adoptTheme", () => {
  it("adds a /page line when the document has none", () => {
    expect(adoptTheme("# Hello\n", "look")).toBe("/page --theme look\n# Hello\n");
  });

  it("replaces an existing --theme rather than appending a second", () => {
    const out = adoptTheme("/page A4 --theme old\n\n# Hi\n", "look");
    expect(out).toContain("/page A4 --theme look");
    expect(out).not.toContain("old");
    expect(out.match(/--theme/g)).toHaveLength(1);
  });
});
