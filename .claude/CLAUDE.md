# Polyester Language

A document authoring language using `/command` syntax with Markdown content.

> **IMPORTANT**: Before every commit, you MUST run the full render steps in the "Pre-Commit: Render All Outputs" section below. Never skip this — rendered HTML/SVG files must stay in sync with `.poly` sources.

## Project Structure

```
polyester/
├── src/
│   ├── cli/              # CLI entry point
│   ├── parser/           # Tokenizer and parser
│   ├── backends/
│   │   └── html/         # HTML compiler and components
│   ├── components/       # Component registry
│   ├── themes/           # Theme loading and importers
│   ├── config/           # Configuration
│   └── lsp/              # Language server
├── editors/
│   ├── vscode/           # VS Code extension
│   └── neovim/           # Neovim plugin
├── docs/                 # GitHub Pages site
└── examples/             # Example .poly files
```

## Build & Development

```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript
npm test                 # Run tests
node dist/cli/index.js   # Run CLI directly
```

## Syntax

```polyester
/command arg1 "arg2" --flag value { block content }
```

- **Commands** start with `/` at line start
- **Arguments**: positional (`arg1`), quoted (`"arg with spaces"`)
- **Flags**: `--name value` or `-n value` (boolean flags have no value)
- **Blocks**: `{ ... }` contain nested commands or Markdown
- **Pipes**: `/text "hi" | bold | color red` (transform chains)
- **Content**: Markdown between commands is rendered normally

## Components

### Layout
- `/page size --margin 2cm --landscape` - Document setup
- `/columns count --gap 1.5rem { }` - Multi-column layout
- `/grid "1fr 2fr" --gap 1rem { }` - CSS grid
- `/region --bg #f0f0f0 --padding 2rem { }` - Styled container
- `/center { }` - Horizontal centering
- `/vcenter --height 100vh { }` - Vertical + horizontal centering
- `/frame --border "2px solid blue" --radius 8px { }` - Bordered box

### Content
- `/text "content" --bold --italic --color red --size 2rem`
- `/quote pull "Quote text"` or `/quote { block }`
- `/code language --lines --title "file.ts" { code }`
- `/table --header --striped --bordered { Name | Age\nJohn | 30 }`
- `/list --marker ">" { item1\nitem2 }` or `--ordered`
- `/checkbox "Task" --checked`
- `/image "path.jpg" --width 50% --caption "Figure 1"`

### Style
- `/hero --bg gradient { }` - Hero section (purple/blue gradient is Polyester's signature)
- `/hero --bg gradient --pattern grid { }` - Hero with pattern overlay
- `/background grid { }` - Decorative pattern background (grid, dots, cross, diagonal)
- `/background dots --size 48px --color "rgba(0,0,0,0.15)" --fade radial { }` - Pattern with fade
- `/card --icon rocket { }` - Card with icon
- `/button primary "Label"` - Button element
- `/shape circle --size 50px --fill red --stroke black`

### Interactive
- `/fold "Title" --open { hidden content }` - Collapsible section

## Key Implementation Details

- **PDF generation** uses Puppeteer/Chrome to render HTML (not Typst)
- **Polyester syntax highlighting** is custom-built for both HTML and code blocks
- **Markdown processing** uses unified/remark with GFM support
- **Indented content** is automatically dedented to prevent code block interpretation

## CLI

```bash
poly build input.poly -o output.html
poly build input.poly --format pdf -o output.pdf
poly build docs/*.poly                       # Build multiple files
poly build docs/badges/*.poly --padding 0    # Flags apply to all files
poly help              # List all components
poly help <component>  # Show component details
poly theme list        # List themes
```

## VS Code Extension

Located in `editors/vscode/`. Build and install:

```bash
cd editors/vscode
npm install
npx @vscode/vsce package --allow-missing-repository
code --install-extension polyester-vscode-*.vsix
```

Settings:
- `polyester.cliPath` - Path to CLI (auto-detected from workspace)
- `polyester.lspPath` - Path to LSP server

## Pre-Commit: Render All Outputs

A git pre-commit hook automatically rebuilds all rendered outputs. If you need to render manually:

```bash
npm run build

# Docs → HTML
poly build docs/index.poly docs/cli.poly docs/mcp.poly docs/design-system.poly docs/theme-studio.poly docs/authoring.poly docs/internals.poly

# README hero → SVG
poly build docs/about-polyester.poly -o docs/about-polyester.svg

# Badges → SVG (per-badge widths for tight viewBox)
poly build docs/badges/docs.poly -o docs/badges/docs.svg --width 118 --padding 0 --background none
poly build docs/badges/editors.poly -o docs/badges/editors.svg --width 184 --padding 0 --background none
poly build docs/badges/mcp.poly -o docs/badges/mcp.svg --width 92 --padding 0 --background none

# Examples → HTML
poly build examples/*.poly
```

## File Extension

`.poly` files