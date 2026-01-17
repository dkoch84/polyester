-- Polyester Neovim Plugin
-- Provides LSP integration and build commands for .poly files

local M = {}

-- Default configuration
M.config = {
  -- Path to poly-lsp (if not in PATH)
  lsp_path = "poly-lsp",
  -- Default output format
  default_format = "pdf",
  -- PDF viewer command (e.g., "zathura", "mupdf", "evince")
  pdf_viewer = nil,
  -- Auto-build on save
  auto_build = false,
}

-- Setup function
function M.setup(opts)
  M.config = vim.tbl_deep_extend("force", M.config, opts or {})

  -- Setup LSP
  M.setup_lsp()

  -- Setup commands
  M.setup_commands()

  -- Setup auto-build if enabled
  if M.config.auto_build then
    M.setup_auto_build()
  end
end

-- Setup LSP client
function M.setup_lsp()
  local lspconfig_ok, lspconfig = pcall(require, "lspconfig")
  if not lspconfig_ok then
    vim.notify("polyester: nvim-lspconfig not found, LSP features disabled", vim.log.levels.WARN)
    return
  end

  local configs = require("lspconfig.configs")

  -- Define polyester LSP if not already defined
  if not configs.polyester then
    configs.polyester = {
      default_config = {
        cmd = { M.config.lsp_path, "--stdio" },
        filetypes = { "polyester" },
        root_dir = function(fname)
          return lspconfig.util.find_git_ancestor(fname) or vim.fn.getcwd()
        end,
        settings = {},
      },
    }
  end

  -- Setup the LSP
  lspconfig.polyester.setup({})
end

-- Setup user commands
function M.setup_commands()
  vim.api.nvim_create_user_command("PolyBuild", function(opts)
    local format = opts.args ~= "" and opts.args or M.config.default_format
    M.build(format)
  end, {
    nargs = "?",
    complete = function()
      return { "html", "pdf" }
    end,
    desc = "Build current .poly file to HTML or PDF",
  })

  vim.api.nvim_create_user_command("PolyPreview", function()
    M.preview()
  end, {
    desc = "Build and preview current .poly file",
  })
end

-- Build current file
function M.build(format)
  local file = vim.fn.expand("%:p")
  if not file:match("%.poly$") then
    vim.notify("Not a .poly file", vim.log.levels.ERROR)
    return
  end

  format = format or M.config.default_format
  local ext = format == "pdf" and ".pdf" or ".html"
  local output = file:gsub("%.poly$", ext)

  local cmd = string.format('poly build "%s" --format %s -o "%s"', file, format, output)

  vim.notify("Building: " .. file, vim.log.levels.INFO)

  vim.fn.jobstart(cmd, {
    on_exit = function(_, code)
      if code == 0 then
        vim.notify("Built: " .. output, vim.log.levels.INFO)
        -- Store output path for preview
        vim.b.polyester_output = output
      else
        vim.notify("Build failed", vim.log.levels.ERROR)
      end
    end,
    on_stderr = function(_, data)
      if data and #data > 0 and data[1] ~= "" then
        vim.notify(table.concat(data, "\n"), vim.log.levels.ERROR)
      end
    end,
  })
end

-- Preview the built output
function M.preview()
  -- First build
  M.build(M.config.default_format)

  -- Wait a bit then open
  vim.defer_fn(function()
    local output = vim.b.polyester_output
    if not output then
      vim.notify("No output file to preview", vim.log.levels.WARN)
      return
    end

    if output:match("%.pdf$") and M.config.pdf_viewer then
      -- Open PDF with configured viewer
      vim.fn.jobstart({ M.config.pdf_viewer, output }, { detach = true })
    elseif output:match("%.html$") then
      -- Open HTML in browser
      local open_cmd = vim.fn.has("mac") == 1 and "open" or "xdg-open"
      vim.fn.jobstart({ open_cmd, output }, { detach = true })
    else
      vim.notify("Unknown output format: " .. output, vim.log.levels.WARN)
    end
  end, 1000)
end

-- Setup auto-build on save
function M.setup_auto_build()
  vim.api.nvim_create_autocmd("BufWritePost", {
    pattern = "*.poly",
    callback = function()
      M.build()
    end,
    group = vim.api.nvim_create_augroup("PolyesterAutoBuild", { clear = true }),
  })
end

return M
