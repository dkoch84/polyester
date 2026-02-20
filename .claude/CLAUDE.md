# Polyester Language

A document authoring language using `/command` syntax with Markdown content.

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

Before committing, always rebuild all rendered outputs so they stay in sync with source `.poly` files.

```bash
# 1. Build TypeScript first
npm run build

# 2. Render all docs pages as HTML
node dist/cli/index.js build docs/index.poly -o docs/index.html
node dist/cli/index.js build docs/mcp.poly -o docs/mcp.html
node dist/cli/index.js build docs/design-system.poly -o docs/design-system.html
node dist/cli/index.js build docs/theme-studio.poly -o docs/theme-studio.html

# 3. Render about-polyester as SVG (used in README)
node dist/cli/index.js build docs/about-polyester.poly -o docs/about-polyester.svg

# 4. Render badge SVGs (used in README)
node dist/cli/index.js build docs/badges/docs.poly -o docs/badges/docs.svg --width 118 --padding 0 --background none
node dist/cli/index.js build docs/badges/editors.poly -o docs/badges/editors.svg --width 184 --padding 0 --background none
node dist/cli/index.js build docs/badges/mcp.poly -o docs/badges/mcp.svg --width 92 --padding 0 --background none

# 5. Render examples as HTML
for f in examples/*.poly; do node dist/cli/index.js build "$f"; done
```

## File Extension

`.poly` files