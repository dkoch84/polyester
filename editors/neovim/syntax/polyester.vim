" Vim syntax file for Polyester
" Language: Polyester
" Maintainer: Polyester Team

if exists("b:current_syntax")
  finish
endif

" Commands: /command
syn match polyCommand "^\s*/\w\+" contains=polyCommandSlash,polyCommandName
syn match polyCommandSlash "/" contained
syn match polyCommandName "\w\+" contained

" Flags: --flag or -f
syn match polyFlag "--[a-zA-Z][a-zA-Z0-9-]*"
syn match polyFlagShort "-[a-zA-Z]"

" Strings
syn region polyString start=/"/ skip=/\\"/ end=/"/ contains=polyEscape
syn region polyStringSingle start=/'/ skip=/\\'/ end=/'/ contains=polyEscape
syn match polyEscape "\\." contained

" Numbers and measurements
syn match polyNumber "\<\d\+\(\.\d\+\)\?\(px\|pt\|em\|rem\|cm\|mm\|in\|%\)\?\>"

" Colors
syn match polyColor "#[0-9a-fA-F]\{3,8\}\>"

" Pipes
syn match polyPipe "|"

" Braces
syn match polyBrace "[{}]"

" Comments (optional, if you want them)
syn match polyComment "//.*$"
syn region polyBlockComment start="/\*" end="\*/"

" Markdown headings
syn match polyHeading "^#\{1,6\}\s.*$"

" Markdown emphasis
syn match polyBold "\*\*[^*]\+\*\*"
syn match polyItalic "\*[^*]\+\*"
syn region polyInlineCode start="`" end="`"

" Code blocks
syn region polyCodeBlock start="```" end="```" contains=@NoSpell

" Highlighting
hi def link polyCommand Function
hi def link polyCommandSlash Delimiter
hi def link polyCommandName Function
hi def link polyFlag Identifier
hi def link polyFlagShort Identifier
hi def link polyString String
hi def link polyStringSingle String
hi def link polyEscape SpecialChar
hi def link polyNumber Number
hi def link polyColor Constant
hi def link polyPipe Operator
hi def link polyBrace Delimiter
hi def link polyComment Comment
hi def link polyBlockComment Comment
hi def link polyHeading Title
hi def link polyBold Bold
hi def link polyItalic Italic
hi def link polyInlineCode Special
hi def link polyCodeBlock Special

let b:current_syntax = "polyester"
