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
import { loadTheme, listThemes, saveTheme, themeToCSS } from "../themes/loader.js";
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
  name?: string;
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
    } else if (arg === "-n" || arg === "--name") {
      result.name = args[++i];
    } else if (arg === "-w" || arg === "--watch") {
      result.watch = true;
    } else if (!arg.startsWith("-")) {
      if (!result.command) {
        result.command = arg;
      } else if (!result.subcommand && result.command === "theme") {
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

Commands:
  build           Compile a .poly file to HTML or PDF
  watch           Watch file and recompile on changes
  help            List all components or show help for a specific component
  theme import    Import a colorscheme as a theme
  theme list      List available themes

Options:
  -o, --output <file>   Output file path
  -f, --format <fmt>    Output format: html (default), pdf, svg
                        For theme import: xresources, pywal, base16, kitty, alacritty
  -t, --theme <name>    Theme for syntax highlighting (default: default)
  -n, --name <name>     Name for imported theme
  -w, --watch           Watch for changes
  -h, --help            Show this help message

Examples:
  poly build document.poly
  poly build document.poly -o out.html --theme gruvbox
  poly build document.poly --format pdf -o out.pdf
  poly watch document.poly
  poly help
  poly help columns
  poly theme import ~/.Xresources --name gruvbox
  poly theme list
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

function buildHtml(inputPath: string, outputPath: string, themeName?: string): void {
  const absoluteInput = resolve(inputPath);
  const source = readFileSync(absoluteInput, "utf-8");

  // Load config and theme
  const config = loadConfig();
  const theme = loadTheme(themeName || config.defaultTheme);
  const themeCSS = themeToCSS(theme);

  // Parse
  const ast = parse(source);

  // Compile
  const { html } = compileToHtml(ast, {
    standalone: true,
    title: basename(inputPath, ".poly"),
    customCss: themeCSS,
  });

  // Output
  const absoluteOutput = resolve(outputPath);
  writeFileSync(absoluteOutput, html);
  console.log(`✓ Compiled ${inputPath} → ${outputPath} (theme: ${theme.name})`);
}

async function buildPdf(inputPath: string, outputPath: string, themeName?: string): Promise<void> {
  const absoluteInput = resolve(inputPath);
  const source = readFileSync(absoluteInput, "utf-8");

  // Load config and theme
  const config = loadConfig();
  const theme = loadTheme(themeName || config.defaultTheme);
  const themeCSS = themeToCSS(theme);

  // Parse
  const ast = parse(source);

  // Compile to HTML first
  const { html } = compileToHtml(ast, {
    standalone: true,
    title: basename(inputPath, ".poly"),
    customCss: themeCSS,
  });

  // Use Puppeteer to render HTML to PDF
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch();
  const page = await browser.newPage();

  // Set viewport to match typical browser width for consistent rendering
  await page.setViewport({ width: 800, height: 1200 });

  await page.setContent(html, { waitUntil: "networkidle0" });

  const absoluteOutput = resolve(outputPath);
  await page.pdf({
    path: absoluteOutput,
    format: "A4",
    margin: { top: "1.5cm", right: "1.5cm", bottom: "1.5cm", left: "1.5cm" },
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();
  console.log(`✓ Compiled ${inputPath} → ${outputPath} (theme: ${theme.name})`);
}

function buildSvg(inputPath: string, outputPath: string, options?: { width?: number }): void {
  const absoluteInput = resolve(inputPath);
  const source = readFileSync(absoluteInput, "utf-8");

  // Parse
  const ast = parse(source);

  // Compile to SVG
  const { svg } = compileToSvg(ast, {
    width: options?.width ?? 800,
  });

  // Output
  const absoluteOutput = resolve(outputPath);
  writeFileSync(absoluteOutput, svg);
  console.log(`✓ Compiled ${inputPath} → ${outputPath}`);
}

async function build(inputPath: string, outputPath?: string, themeName?: string, format?: string): Promise<void> {
  // Determine format from output extension or explicit format
  let outputFormat = format || "html";
  if (!format && outputPath) {
    const ext = extname(outputPath).toLowerCase();
    if (ext === ".pdf") outputFormat = "pdf";
    else if (ext === ".svg") outputFormat = "svg";
  }

  // Determine output path
  let defaultExt = ".html";
  if (outputFormat === "pdf") defaultExt = ".pdf";
  else if (outputFormat === "svg") defaultExt = ".svg";

  const finalOutput = outputPath || inputPath.replace(/\.poly$/, defaultExt);

  if (outputFormat === "pdf") {
    await buildPdf(inputPath, finalOutput, themeName);
  } else if (outputFormat === "svg") {
    buildSvg(inputPath, finalOutput);
  } else {
    buildHtml(inputPath, finalOutput, themeName);
  }
}

async function watchFile(inputPath: string, themeName?: string, format?: string): Promise<void> {
  const absoluteInput = resolve(inputPath);
  const outputFormat = format || "html";
  const outputPath = inputPath.replace(/\.poly$/, outputFormat === "pdf" ? ".pdf" : ".html");

  console.log(`Watching ${inputPath} (output: ${outputFormat})...`);

  // Initial build
  try {
    await build(inputPath, outputPath, themeName, outputFormat);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
  }

  // Watch for changes
  watch(absoluteInput, async (eventType) => {
    if (eventType === "change") {
      try {
        await build(inputPath, outputPath, themeName, outputFormat);
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
      await build(args.input, args.output, args.theme, args.format);
      break;

    case "watch":
      if (!args.input) {
        console.error("Error: No input file specified");
        printHelp();
        process.exit(1);
      }
      await watchFile(args.input, args.theme, args.format);
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
