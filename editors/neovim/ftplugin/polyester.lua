-- Buffer-local defaults for .poly files.
-- Prose, not code: wrap at a readable measure and let gq reflow paragraphs.

vim.opt_local.textwidth = 88
vim.opt_local.wrap = true
vim.opt_local.linebreak = true
vim.opt_local.breakindent = true

-- t: wrap prose at textwidth. n: keep list markers hanging when reflowing.
-- j: drop the comment leader when joining. No 'c'/'r'/'o', so /commands are
-- never treated as comment leaders to continue.
vim.opt_local.formatoptions = "tnjq"

vim.opt_local.commentstring = ""

-- A /command block opens and closes with braces, so brace matching is the
-- structure worth folding on.
vim.opt_local.foldmethod = "marker"
vim.opt_local.foldmarker = "{,}"
vim.opt_local.foldlevel = 99

vim.keymap.set("n", "<localleader>o", function()
  require("polyester").open(vim.b.polyester_output)
end, { buffer = true, desc = "Open the last Polyester build" })
