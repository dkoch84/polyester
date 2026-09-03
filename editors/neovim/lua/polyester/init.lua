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
  -- Where builds are written. Nil puts the artifact beside its source, which
  -- with auto_build drops an .html into every content directory on save.
  output_dir = nil,
}

local FORMATS = { "html", "pdf", "svg" }

local EXTENSIONS = { html = ".html", pdf = ".pdf", svg = ".svg" }

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
    local format = opts.fargs[1] or M.config.default_format
    M.build(format, opts.fargs[2])
  end, {
    nargs = "*",
    complete = function(_, line)
      -- Only the first argument is a format; the second is an output path.
      if line:match("^%s*%S+%s+%S*$") then return FORMATS end
      return vim.fn.getcompletion(line:match("%S*$") or "", "file")
    end,
    desc = "Build current .poly file: PolyBuild [format] [output]",
  })

  vim.api.nvim_create_user_command("PolyPreview", function()
    M.preview()
  end, {
    desc = "Build and preview current .poly file",
  })
end

-- Where a build lands: an explicit path wins, then output_dir, then beside the source.
local function resolve_output(file, format, explicit)
  if explicit and explicit ~= "" then
    return vim.fn.fnamemodify(explicit, ":p")
  end

  local ext = EXTENSIONS[format] or ".html"
  if not M.config.output_dir then
    return (file:gsub("%.poly$", ext))
  end

  local dir = vim.fn.fnamemodify(M.config.output_dir, ":p"):gsub("/$", "")
  vim.fn.mkdir(dir, "p")
  return dir .. "/" .. vim.fn.fnamemodify(file, ":t:r") .. ext
end

-- Build current file. on_done receives the output path, and only when the build
-- actually succeeded.
function M.build(format, output, on_done)
  local file = vim.fn.expand("%:p")
  if not file:match("%.poly$") then
    vim.notify("Not a .poly file", vim.log.levels.ERROR)
    return
  end

  format = format or M.config.default_format
  output = resolve_output(file, format, output)

  vim.notify("Building: " .. file, vim.log.levels.INFO)

  -- List form: no shell, so a space or a quote in a path cannot break the command.
  vim.fn.jobstart({ "poly", "build", file, "--format", format, "-o", output }, {
    on_exit = function(_, code)
      if code ~= 0 then
        vim.notify("Build failed", vim.log.levels.ERROR)
        return
      end
      vim.notify("Built: " .. output, vim.log.levels.INFO)
      vim.b.polyester_output = output
      if on_done then on_done(output) end
    end,
    on_stderr = function(_, data)
      if data and #data > 0 and data[1] ~= "" then
        vim.notify(table.concat(data, "\n"), vim.log.levels.ERROR)
      end
    end,
  })
end

-- Open an already-built artifact.
function M.open(output)
  if not output then
    vim.notify("No output file to preview", vim.log.levels.WARN)
    return
  end

  if output:match("%.pdf$") and M.config.pdf_viewer then
    vim.fn.jobstart({ M.config.pdf_viewer, output }, { detach = true })
  elseif output:match("%.pdf$") or output:match("%.html$") or output:match("%.svg$") then
    local open_cmd = vim.fn.has("mac") == 1 and "open" or "xdg-open"
    vim.fn.jobstart({ open_cmd, output }, { detach = true })
  else
    vim.notify("Unknown output format: " .. output, vim.log.levels.WARN)
  end
end

-- Build, then open once the build reports success. Opening on a timer instead
-- raced the build: a slow one opened a stale file, or nothing at all.
function M.preview()
  M.build(M.config.default_format, nil, M.open)
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
