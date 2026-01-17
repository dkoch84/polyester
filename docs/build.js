#!/usr/bin/env node
/**
 * Post-process the documentation HTML
 * Adds title, meta tags, and Polyester syntax highlighting
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, 'index.html');

let html = readFileSync(htmlPath, 'utf-8');

// Replace title
html = html.replace(
  '<title>index</title>',
  `<title>Polyester - Document Language</title>
  <meta name="description" content="A document authoring language combining Markdown simplicity with programming power.">`
);

// Add Polyester syntax highlighting script before </head>
const highlightScript = `
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      document.querySelectorAll('.language-polyester').forEach(function(block) {
        let html = block.innerHTML;
        // Commands: /word
        html = html.replace(/(\\/\\w+)/g, '<span style="color: #ff7b72;">$1</span>');
        // Flags: --word or -w
        html = html.replace(/(--\\w+|-\\w)(?=\\s|$|&)/g, '<span style="color: #79c0ff;">$1</span>');
        // Strings: "..."
        html = html.replace(/(&quot;[^&]*&quot;)/g, '<span style="color: #a5d6ff;">$1</span>');
        // Braces
        html = html.replace(/([{}])/g, '<span style="color: #ffa657;">$1</span>');
        block.innerHTML = html;
      });
    });
  </script>
</head>`;

html = html.replace('</head>', highlightScript);

writeFileSync(htmlPath, html);
console.log('Documentation post-processed: docs/index.html');
