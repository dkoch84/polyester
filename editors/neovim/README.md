# Polyester Neovim Plugin

Language support for Polyester documents in Neovim.

## Features

- Syntax highlighting
- LSP integration (diagnostics, completions, hover)
- `:PolyBuild` command for HTML/PDF output
- `:PolyPreview` command to build and open in viewer
- Auto-build on save (optional)

## Installation

### lazy.nvim

```lua
{
  "polyester/polyester.nvim",
  ft = "polyester",
  config = function()
    require("polyester").setup({
      -- Path to poly-lsp if not in PATH
      lsp_path = "poly-lsp",
      -- Default output format: "html" or "pdf"
      default_format = "pdf",
      -- PDF viewer (e.g., "zathura", "mupdf", "evince")
      pdf_viewer = "zathura",
      -- Auto-build on save
      auto_build = false,
    })
  end,
}
```

### Manual Installation

Copy the plugin to your Neovim config:

```bash
cp -r editors/neovim/* ~/.config/nvim/
```

Then add to your config:

```lua
require("polyester").setup()
```

## Requirements

- Neovim 0.9+
- `poly` CLI installed and in PATH
- `poly-lsp` for LSP features
- `nvim-lspconfig` for LSP integration
- Typst for PDF output

## Commands

- `:PolyBuild [html|pdf]` - Build current file
- `:PolyPreview` - Build and open in viewer

## Configuration

```lua
require("polyester").setup({
  lsp_path = "poly-lsp",     -- LSP executable path
  default_format = "pdf",     -- Default build format
  pdf_viewer = "zathura",     -- PDF viewer command
  auto_build = false,         -- Build on save
})
```
