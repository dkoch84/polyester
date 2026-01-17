-- Polyester plugin loader
-- This file is automatically loaded by Neovim

-- Only load once
if vim.g.loaded_polyester then
  return
end
vim.g.loaded_polyester = true

-- The actual setup is done via require("polyester").setup()
-- This file just ensures the filetype is registered
vim.filetype.add({
  extension = {
    poly = "polyester",
  },
})
