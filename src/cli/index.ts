#!/usr/bin/env node

/**
 * Polyester CLI
 *
 * Usage:
 *   poly build input.poly -o output.html
 *   poly build input.poly --format html --theme gruvbox
 *   poly watch input.poly
 *   poly theme import ~/.Xresources --name gruvbox
 *   poly theme list
 *   poly help
 *   poly help <component>
 */

import { readFileSync, writeFileSync, watch } from "node:fs";
import { resolve, basename, dirname, extname } from "node:path";
import { parse } from "../parser/parser.js";
import { compileToHtml } from "../backends/html/compiler.js";
import { compileToSvg } from "../backends/svg/compiler.js";
import {
  loadTheme,
  listThemes,
  saveTheme,
  themeToCSS,
  resolveModules,
  styleToCSS,
  spacingToCSS,
  syntaxToCSS,
  listStyles,
  listSpacingPresets,
} from "../themes/loader.js";
import { importTheme, ImporterFormat } from "../themes/importers/index.js";
import { loadConfig } from "../config/index.js";
import {
  getComponent,
  formatComponentHelp,
  formatComponentsList,
  COMPONENTS,
} from "../components/registry.js";

interface CliArgs {
  command: string;
  subcommand?: string;
  input?: string;
  output?: string;
  format?: string;
  theme?: string;
  style?: string;
  spacing?: string;
  name?: string;
  width?: number;
  padding?: number;
  background?: string;
  watch?: boolean;
  help?: boolean;
  json?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    command: "",
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "-o" || arg === "--output") {
      result.output = args[++i];
    } else if (arg === "-f" || arg === "--format") {
      result.format = args[++i];
    } else if (arg === "-t" || arg === "--theme") {
      result.theme = args[++i];
    } else if (arg === "--style") {
      result.style = args[++i];
    } else if (arg === "--spacing") {
      result.spacing = args[++i];
    } else if (arg === "-n" || arg === "--name") {
      result.name = args[++i];
    } else if (arg === "--width") {
      result.width = parseInt(args[++i], 10);
    } else if (arg === "--padding") {
      result.padding = parseInt(args[++i], 10);
    } else if (arg === "--background") {
      result.background = args[++i];
    } else if (arg === "-w" || arg === "--watch") {
      result.watch = true;
    } else if (!arg.startsWith("-")) {
      if (!result.command) {
        result.command = arg;
      } else if (!result.subcommand && (result.command === "theme" || result.command === "style" || result.command === "spacing")) {
        result.subcommand = arg;
      } else if (!result.input) {
        result.input = arg;
      }
    }

    i++;
  }

  return result;
}

function printHelp(): void {
  console.log(`
Polyester - Document authoring language

Usage:
  poly build <input.poly> [-o output] [--format html|pdf|svg] [--theme name]
  poly watch <input.poly> [--format html|pdf]
  poly help [component]
  poly theme import <file> --name <name> [--format <format>]
  poly theme list
  poly style list
  poly spacing list

Commands:
  build           Compile a .poly file to HTML or PDF
  watch           Watch file and recompile on changes
  help            List all components or show help for a specific component
  theme import    Import a colorscheme as a syntax theme
  theme list      List available themes
  style list      List available style modules
  spacing list    List available spacing presets

Options:
  -o, --output <file>   Output file path
  -f, --format <fmt>    Output format: html (default), pdf, svg
                        For theme import: xresources, pywal, base16, kitty, alacritty
  -t, --theme <name>    Composed theme (style + spacing + syntax)
  --style <name>        Style module (colors, fonts, borders, shadows)
  --spacing <name>      Spacing module (compact, default, spacious)
  -n, --name <name>     Name for imported theme
  -w, --watch           Watch for changes
  -h, --help            Show this help message

Examples:
  poly build document.poly
  poly build document.poly -o out.html --theme gruvbox
  poly build document.poly --style corporate --spacing compact
  poly build document.poly --format pdf -o out.pdf
  poly watch document.poly
  poly help
  poly help columns
  poly theme import ~/.Xresources --name gruvbox
  poly theme list
  poly style list
`);
}

function printComponentHelp(componentName?: string, asJson?: boolean): void {
  if (asJson) {
    // Output component data as JSON for tooling consumption
    if (componentName) {
      const name = componentName.replace(/^\//, "");
      const component = getComponent(name);
      if (component) {
        console.log(JSON.stringify(component, null, 2));
      } else {
        console.error(JSON.stringify({ error: `Unknown component: ${componentName}` }));
        process.exit(1);
      }
    } else {
      // Output all components
      console.log(JSON.stringify(COMPONENTS, null, 2));
    }
    return;
  }

  if (!componentName) {
    // List all components
    console.log("Polyester Components\n");
    console.log(formatComponentsList());
    console.log("Run 'poly help <component>' for detailed usage information.");
  } else {
    // Show help for specific component
    const name = componentName.replace(/^\//, ""); // Remove leading slash if present
    const component = getComponent(name);
    if (component) {
      console.log(formatComponentHelp(component));
    } else {
      console.error(`Unknown component: ${componentName}`);
      console.error("Run 'poly help' to see all available components.");
      process.exit(1);
    }
  }
}

function buildHtml(
  inputPath: string,
  outputPath: string,
  opts?: { theme?: string; style?: string; spacing?: string },
): void {
  const absoluteInput = resolve(inputPath);
  const source = readFileSync(absoluteInput, "utf-8");

  // Load config
  const config = loadConfig();

  // Parse first to check for /page settings
  const ast = parse(source);

  // Initial compile to extract pageSettings (which may contain --theme/--style/--spacing)
  const initialResult = compileToHtml(ast, { standalone: false });
  const ps = initialResult.pageSettings;

  // Resolve modules: CLI flags → /page flags → config defaults
  const resolved = resolveModules({
    theme: opts?.theme || ps.theme || config.defaultTheme,
    style: opts?.style || ps.style,
    spacing: opts?.spacing || ps.spacing,
  });

  // Generate module CSS
  const styleCss = styleToCSS(resolved.style);
  const spacingCss = spacingToCSS(resolved.spacing);
  const syntaxCss = syntaxToCSS(resolved.syntax, resolved.name);

  // Re-compile with full CSS
  const { html } = compileToHtml(ast, {
    standalone: true,
    title: basename(inputPath, ".poly"),
    styleCss,
    spacingCss,
    syntaxCss,
  });

  const absoluteOutput = resolve(outputPath);
  writeFileSync(absoluteOutput, html);
  console.log(`✓ Compiled ${inputPath} → ${outputPath}`);
}

async function buildPdf(
  inputPath: string,
  outputPath: string,
  opts?: { theme?: string; style?: string; spacing?: string },
): Promise<void> {
  const absoluteInput = resolve(inputPath);
  const source = readFileSync(absoluteInput, "utf-8");

  // Load config
  const config = loadConfig();

  // Parse
  const ast = parse(source);

  // Initial compile to extract pageSettings
  const initialResult = compileToHtml(ast, { standalone: false });
  const ps = initialResult.pageSettings;

  // Resolve modules
  const resolved = resolveModules({
    theme: opts?.theme || ps.theme || config.defaultTheme,
    style: opts?.style || ps.style,
    spacing: opts?.spacing || ps.spacing,
  });

  const styleCss = styleToCSS(resolved.style);
  const spacingCss = spacingToCSS(resolved.spacing);
  const syntaxCss = syntaxToCSS(resolved.syntax, resolved.name);

  // Compile to HTML
  const { html, pageSettings } = compileToHtml(ast, {
    standalone: true,
    title: basename(inputPath, ".poly"),
    styleCss,
    spacingCss,
    syntaxCss,
  });

  // Use Puppeteer to render HTML to PDF
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch();
  const page = await browser.newPage();

  // Set viewport to match typical browser width for consistent rendering
  await page.setViewport({ width: 800, height: 1200 });

  await page.setContent(html, { waitUntil: "networkidle0" });

  const absoluteOutput = resolve(outputPath);

  if (pageSettings.pageless) {
    // Pageless mode: calculate full content height and render as single continuous page
    const contentHeight = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      return Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
      );
    });

    // Use a standard width (A4 width) but dynamic height
    const pageWidth = 794; // A4 width in pixels at 96 DPI
    const margin = pageSettings.margin || "1.5cm";

    await page.pdf({
      path: absoluteOutput,
      width: pageWidth,
      height: contentHeight + 100, // Add some padding
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      printBackground: true,
    });
  } else {
    await page.pdf({
      path: absoluteOutput,
      format: "A4",
      margin: { top: "1.5cm", right: "1.5cm", bottom: "1.5cm", left: "1.5cm" },
      printBackground: true,
      preferCSSPageSize: true,
    });
  }

  await browser.close();
  console.log(`✓ Compiled ${inputPath} → ${outputPath}`);
}

function buildSvg(inputPath: string, outputPath: string, options?: { width?: number; padding?: number; background?: string }): void {
  const absoluteInput = resolve(inputPath);
  const source = readFileSync(absoluteInput, "utf-8");

  // Parse
  const ast = parse(source);

  // Compile to SVG
  const { svg } = compileToSvg(ast, {
    width: options?.width ?? 800,
    ...(options?.padding !== undefined && { padding: options.padding }),
    ...(options?.background !== undefined && { background: options.background }),
  });

  // Output
  const absoluteOutput = resolve(outputPath);
  writeFileSync(absoluteOutput, svg);
  console.log(`✓ Compiled ${inputPath} → ${outputPath}`);
}

interface BuildOpts {
  theme?: string;
  style?: string;
  spacing?: string;
  format?: string;
  width?: number;
  padding?: number;
  background?: string;
}

async function build(inputPath: string, outputPath?: string, opts?: BuildOpts): Promise<void> {
  // Determine format from output extension or explicit format
  let outputFormat = opts?.format || "html";
  if (!opts?.format && outputPath) {
    const ext = extname(outputPath).toLowerCase();
    if (ext === ".pdf") outputFormat = "pdf";
    else if (ext === ".svg") outputFormat = "svg";
  }

  // Determine output path
  let defaultExt = ".html";
  if (outputFormat === "pdf") defaultExt = ".pdf";
  else if (outputFormat === "svg") defaultExt = ".svg";

  const finalOutput = outputPath || inputPath.replace(/\.poly$/, defaultExt);

  const moduleOpts = { theme: opts?.theme, style: opts?.style, spacing: opts?.spacing };

  if (outputFormat === "pdf") {
    await buildPdf(inputPath, finalOutput, moduleOpts);
  } else if (outputFormat === "svg") {
    buildSvg(inputPath, finalOutput, { width: opts?.width, padding: opts?.padding, background: opts?.background });
  } else {
    buildHtml(inputPath, finalOutput, moduleOpts);
  }
}

async function watchFile(inputPath: string, opts?: BuildOpts): Promise<void> {
  const absoluteInput = resolve(inputPath);
  const outputFormat = opts?.format || "html";
  const outputPath = inputPath.replace(/\.poly$/, outputFormat === "pdf" ? ".pdf" : ".html");

  console.log(`Watching ${inputPath} (output: ${outputFormat})...`);

  // Initial build
  try {
    await build(inputPath, outputPath, opts);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
  }

  // Watch for changes
  watch(absoluteInput, async (eventType) => {
    if (eventType === "change") {
      try {
        await build(inputPath, outputPath, opts);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
      }
    }
  });
}

function themeImport(filePath: string, name: string, format?: string): void {
  try {
    const theme = importTheme(
      resolve(filePath),
      name,
      format as ImporterFormat | undefined
    );
    saveTheme(theme);
    console.log(`✓ Imported theme "${name}" from ${filePath}`);
  } catch (err) {
    console.error(`Error importing theme: ${(err as Error).message}`);
    process.exit(1);
  }
}

function themeList(): void {
  const themes = listThemes();
  console.log("Available themes:");
  for (const name of themes) {
    console.log(`  ${name}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.command) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  switch (args.command) {
    case "build":
      if (!args.input) {
        console.error("Error: No input file specified");
        printHelp();
        process.exit(1);
      }
      await build(args.input, args.output, {
        theme: args.theme,
        style: args.style,
        spacing: args.spacing,
        format: args.format,
        width: args.width,
        padding: args.padding,
        background: args.background,
      });
      break;

    case "watch":
      if (!args.input) {
        console.error("Error: No input file specified");
        printHelp();
        process.exit(1);
      }
      await watchFile(args.input, {
        theme: args.theme,
        style: args.style,
        spacing: args.spacing,
        format: args.format,
      });
      break;

    case "help":
      printComponentHelp(args.input, args.json);
      break;

    case "theme":
      switch (args.subcommand) {
        case "import":
          if (!args.input) {
            console.error("Error: No input file specified");
            console.error("Usage: poly theme import <file> --name <name>");
            process.exit(1);
          }
          if (!args.name) {
            console.error("Error: No theme name specified");
            console.error("Usage: poly theme import <file> --name <name>");
            process.exit(1);
          }
          themeImport(args.input, args.name, args.format);
          break;

        case "list":
          themeList();
          break;

        default:
          console.error("Error: Unknown theme subcommand");
          console.error("Available: import, list");
          process.exit(1);
      }
      break;

    case "style":
      switch (args.subcommand) {
        case "list":
          console.log("Available styles:");
          for (const name of listStyles()) {
            console.log(`  ${name}`);
          }
          break;
        default:
          console.error("Error: Unknown style subcommand");
          console.error("Available: list");
          process.exit(1);
      }
      break;

    case "spacing":
      switch (args.subcommand) {
        case "list":
          console.log("Available spacing presets:");
          for (const name of listSpacingPresets()) {
            console.log(`  ${name}`);
          }
          break;
        default:
          console.error("Error: Unknown spacing subcommand");
          console.error("Available: list");
          process.exit(1);
      }
      break;

    default:
      console.error(`Unknown command: ${args.command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
