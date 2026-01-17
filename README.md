# Polyester

A document authoring language that combines Markdown simplicity with programming power.

**[View Documentation](https://yourusername.github.io/polyester/)** | **[Examples](./examples/)**

## Features

- **Familiar Syntax** - Markdown you know, enhanced with `/commands`
- **Multiple Outputs** - Compile to HTML or PDF (via Chrome)
- **Terminal Theming** - Import colorschemes from Xresources, kitty, pywal, and more
- **Editor Support** - VSCode extension and Neovim plugin with full LSP
- **20+ Components** - Layouts, tables, code blocks, shapes, and more

## Quick Example

```polyester
/page A4 --margin 2cm

/hero --bg gradient {
  # Welcome to Polyester
  Documents that feel like home.
  /button primary "Get Started"
}

/columns 2 --gap 2rem {
  /card --icon rocket {
    ## Fast
    Compiles instantly.
  }
  /card --icon shield {
    ## Powerful
    Full layout control.
  }
}

/code typescript --lines {
const greeting = "Hello, World!";
console.log(greeting);
}
```

## Installation

```bash
npm install -g polyester
```

## Usage

```bash
# Build to HTML
poly build document.poly

# Build to PDF
poly build document.poly --format pdf

# Watch for changes
poly watch document.poly

# Get help
poly help
poly help columns
```

## Theming

Import colorschemes from your terminal:

```bash
poly theme import ~/.Xresources --name my-theme
poly theme import ~/.config/kitty/kitty.conf --name kitty
poly theme import ~/.cache/wal/colors.json --name pywal

poly build doc.poly --theme my-theme
```

## Editor Support

### VSCode

Install the Polyester extension from `editors/vscode/`:

```bash
cd editors/vscode && npm install && npm run build
code --install-extension polyester-*.vsix
```

### Neovim

Add to your config (see `editors/neovim/`):

```lua
require('polyester').setup()
```

## Components

| Category | Components |
|----------|------------|
| **Layout** | `page`, `columns`, `grid`, `region`, `sidebar`, `center`, `vcenter`, `frame` |
| **Content** | `text`, `quote`, `code`, `table`, `list`, `checkbox`, `image` |
| **Style** | `hero`, `card`, `button`, `shape` |
| **Interactive** | `fold` |

Run `poly help <component>` for detailed documentation.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Link CLI globally
npm link
```

## License

GPL-3.0 - see [LICENSE](LICENSE)
