/**
 * Theme Studio
 *
 * A webview panel for visually editing Polyester design tokens.
 * Left panel: controls (color pickers, sliders, dropdowns, preset selectors).
 * Right panel: live preview of a demo document, updated via CSS variable injection.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { homedir } from "os";
import { compile as compilePoly } from "./polyRuntime";

let editorPanel: vscode.WebviewPanel | undefined;

// ─── Built-in presets (must match src/themes/starters.ts) ──────

const STYLE_PRESETS: Record<string, Record<string, string>> = {
  default: {
    "color-primary": "#3b82f6", "color-primary-light": "#60a5fa", "color-primary-dark": "#2563eb",
    "color-secondary": "#475569", "color-accent": "#d97706",
    "color-bg": "#ffffff", "color-surface": "#f9fafb",
    "color-text": "#1a1a1a", "color-text-muted": "#666666",
    "color-border": "#e5e5e5", "color-link": "#3b82f6",
    "color-success": "#16a34a", "color-warning": "#d97706", "color-error": "#dc2626",
    "font-body": "system-ui, -apple-system, sans-serif",
    "font-heading": "system-ui, -apple-system, sans-serif",
    "font-mono": "ui-monospace, monospace",
    "radius": "0.5rem", "border-width": "1px",
    "shadow-card": "none", "shadow-elevated": "0 4px 12px rgba(0,0,0,0.1)",
    "hero-gradient": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "hero-text": "#ffffff",
  },
  corporate: {
    "color-primary": "#1e40af", "color-primary-light": "#3b82f6", "color-primary-dark": "#1e3a8a",
    "color-secondary": "#475569", "color-accent": "#d97706",
    "color-bg": "#ffffff", "color-surface": "#f8fafc",
    "color-text": "#0f172a", "color-text-muted": "#64748b",
    "color-border": "#cbd5e1", "color-link": "#1e40af",
    "color-success": "#16a34a", "color-warning": "#d97706", "color-error": "#dc2626",
    "font-body": "Inter, system-ui, sans-serif",
    "font-heading": "Inter, system-ui, sans-serif",
    "font-mono": "JetBrains Mono, ui-monospace, monospace",
    "radius": "0.25rem", "border-width": "1px",
    "shadow-card": "0 1px 3px rgba(0,0,0,0.1)", "shadow-elevated": "0 4px 12px rgba(0,0,0,0.15)",
    "hero-gradient": "linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)",
    "hero-text": "#ffffff",
  },
  minimal: {
    "color-primary": "#18181b", "color-primary-light": "#3f3f46", "color-primary-dark": "#09090b",
    "color-secondary": "#71717a", "color-accent": "#18181b",
    "color-bg": "#ffffff", "color-surface": "#fafafa",
    "color-text": "#18181b", "color-text-muted": "#a1a1aa",
    "color-border": "#e4e4e7", "color-link": "#18181b",
    "color-success": "#16a34a", "color-warning": "#d97706", "color-error": "#dc2626",
    "font-body": "system-ui, -apple-system, sans-serif",
    "font-heading": "system-ui, -apple-system, sans-serif",
    "font-mono": "ui-monospace, monospace",
    "radius": "0.25rem", "border-width": "1px",
    "shadow-card": "none", "shadow-elevated": "0 2px 8px rgba(0,0,0,0.08)",
    "hero-gradient": "linear-gradient(135deg, #18181b 0%, #3f3f46 100%)",
    "hero-text": "#ffffff",
  },
  playful: {
    "color-primary": "#8b5cf6", "color-primary-light": "#a78bfa", "color-primary-dark": "#7c3aed",
    "color-secondary": "#06b6d4", "color-accent": "#f59e0b",
    "color-bg": "#fffbeb", "color-surface": "#fef3c7",
    "color-text": "#1c1917", "color-text-muted": "#78716c",
    "color-border": "#fcd34d", "color-link": "#8b5cf6",
    "color-success": "#22c55e", "color-warning": "#f59e0b", "color-error": "#ef4444",
    "font-body": "'Nunito', system-ui, sans-serif",
    "font-heading": "'Nunito', system-ui, sans-serif",
    "font-mono": "'Fira Code', ui-monospace, monospace",
    "radius": "1rem", "border-width": "2px",
    "shadow-card": "0 2px 8px rgba(139,92,246,0.15)", "shadow-elevated": "0 8px 24px rgba(139,92,246,0.2)",
    "hero-gradient": "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 50%, #f59e0b 100%)",
    "hero-text": "#ffffff",
  },
  dark: {
    "color-primary": "#60a5fa", "color-primary-light": "#93c5fd", "color-primary-dark": "#3b82f6",
    "color-secondary": "#94a3b8", "color-accent": "#fbbf24",
    "color-bg": "#0f172a", "color-surface": "#1e293b",
    "color-text": "#e2e8f0", "color-text-muted": "#94a3b8",
    "color-border": "#334155", "color-link": "#60a5fa",
    "color-success": "#4ade80", "color-warning": "#fbbf24", "color-error": "#f87171",
    "font-body": "system-ui, -apple-system, sans-serif",
    "font-heading": "system-ui, -apple-system, sans-serif",
    "font-mono": "ui-monospace, monospace",
    "radius": "0.5rem", "border-width": "1px",
    "shadow-card": "0 2px 8px rgba(0,0,0,0.3)", "shadow-elevated": "0 8px 24px rgba(0,0,0,0.4)",
    "hero-gradient": "linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)",
    "hero-text": "#e2e8f0",
  },
  codecargo: {
    "color-primary": "#4B6CF9", "color-primary-light": "#B8F3FF", "color-primary-dark": "#09197A",
    "color-secondary": "#FF9282", "color-accent": "#F4F060",
    "color-bg": "#ffffff", "color-surface": "#F9F9F9",
    "color-text": "#242733", "color-text-muted": "#7D8AB2",
    "color-border": "#dbe2fe", "color-link": "#4B6CF9",
    "color-success": "#34d399", "color-warning": "#F4F060", "color-error": "#ef4444",
    "font-body": "Geist, system-ui, -apple-system, sans-serif",
    "font-heading": "Geist, system-ui, -apple-system, sans-serif",
    "font-mono": "Geist Mono, ui-monospace, monospace",
    "radius": "0.75rem", "border-width": "1px",
    "shadow-card": "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
    "shadow-elevated": "0 0 20px rgba(75,108,249,0.4)",
    "hero-gradient": "linear-gradient(135deg, #4B6CF9 0%, #09197A 100%)",
    "hero-text": "#F9F9F9",
  },
};

const SPACING_PRESETS: Record<string, Record<string, string>> = {
  compact: {
    "spacing-base": "0.75rem", "spacing-page-margin": "1.5cm",
    "spacing-section-gap": "1rem", "spacing-column-gap": "1rem",
    "spacing-card-padding": "1rem", "spacing-block-padding": "0.75rem",
  },
  default: {
    "spacing-base": "1rem", "spacing-page-margin": "2cm",
    "spacing-section-gap": "2rem", "spacing-column-gap": "1.5rem",
    "spacing-card-padding": "1.5rem", "spacing-block-padding": "1rem",
  },
  spacious: {
    "spacing-base": "1.25rem", "spacing-page-margin": "3cm",
    "spacing-section-gap": "3rem", "spacing-column-gap": "2rem",
    "spacing-card-padding": "2rem", "spacing-block-padding": "1.5rem",
  },
};

const FONT_STACKS: Record<string, string> = {
  "System (default)": "system-ui, -apple-system, sans-serif",
  "Inter": "Inter, system-ui, sans-serif",
  "Geist": "Geist, system-ui, -apple-system, sans-serif",
  "Nunito": "'Nunito', system-ui, sans-serif",
  "Georgia (serif)": "Georgia, 'Times New Roman', serif",
  "Lora (serif)": "'Lora', Georgia, serif",
};

const MONO_STACKS: Record<string, string> = {
  "System mono": "ui-monospace, monospace",
  "JetBrains Mono": "JetBrains Mono, ui-monospace, monospace",
  "Geist Mono": "Geist Mono, ui-monospace, monospace",
  "Fira Code": "'Fira Code', ui-monospace, monospace",
  "Source Code Pro": "'Source Code Pro', ui-monospace, monospace",
};

// ─── compile helpers (in-process) ───────────────────────────────

let cachedExtensionPath: string | undefined;

async function compilePolyFile(filePath: string): Promise<string> {
  try {
    const source = fs.readFileSync(filePath, "utf-8");
    return await compilePoly(
      source,
      { sourceDir: path.dirname(filePath), title: path.basename(filePath, ".poly") },
      cachedExtensionPath,
    );
  } catch (err: any) {
    return `<html><body><pre>Build error: ${err.message}</pre></body></html>`;
  }
}

async function compileDemoHtml(context: vscode.ExtensionContext): Promise<string> {
  const precompiled = path.join(context.extensionPath, "out", "reference", "theme-demo.html");
  if (fs.existsSync(precompiled)) {
    return fs.readFileSync(precompiled, "utf-8");
  }

  const polyFile = path.join(context.extensionPath, "reference", "theme-demo.poly");
  if (!fs.existsSync(polyFile)) {
    return "<html><body><p>theme-demo.poly not found</p></body></html>";
  }

  return compilePolyFile(polyFile);
}

/** Extract body content and styles from compiled HTML */
function extractHtmlParts(html: string): { body: string; styles: string } {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  return {
    body: bodyMatch ? bodyMatch[1] : "<p>Could not extract content</p>",
    styles: styleMatch ? styleMatch[1] : "",
  };
}

// ─── Webview HTML ──────────────────────────────────────────────

function buildEditorHtml(demoHtml: string, activePolyFile: string | null): string {
  const { body: bodyContent, styles: demoStyles } = extractHtmlParts(demoHtml);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
/* ─── Editor Chrome ─────────────────────────────────── */
:root {
  --editor-bg: #1e1e1e;
  --editor-fg: #cccccc;
  --editor-border: #333;
  --editor-surface: #252526;
  --editor-accent: #007acc;
  --editor-input-bg: #3c3c3c;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
  display: flex;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: var(--editor-fg);
  background: var(--editor-bg);
}

/* ─── Controls Panel ────────────────────────────────── */
.controls {
  width: 280px;
  min-width: 280px;
  background: var(--editor-surface);
  border-right: 1px solid var(--editor-border);
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.controls h2 {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #888;
  margin: 0;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--editor-border);
}
.controls h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--editor-fg);
  margin-bottom: 8px;
}
.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.control-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.control-row label {
  flex: 1;
  font-size: 12px;
  color: #bbb;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.control-row input[type="color"] {
  width: 28px;
  height: 22px;
  border: 1px solid var(--editor-border);
  border-radius: 3px;
  padding: 1px;
  cursor: pointer;
  background: var(--editor-input-bg);
  flex-shrink: 0;
}
.control-row select {
  background: var(--editor-input-bg);
  color: var(--editor-fg);
  border: 1px solid var(--editor-border);
  border-radius: 3px;
  padding: 3px 6px;
  font-size: 12px;
  flex: 1;
  min-width: 0;
}
.control-row input[type="range"] {
  flex: 1;
  min-width: 0;
  accent-color: var(--editor-accent);
}
.range-value {
  font-size: 11px;
  color: #888;
  min-width: 40px;
  text-align: right;
  font-family: ui-monospace, monospace;
}

/* ─── Toolbar ───────────────────────────────────────── */
.toolbar {
  display: flex;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--editor-border);
}
.toolbar button {
  background: var(--editor-accent);
  color: white;
  border: none;
  border-radius: 3px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  flex: 1;
}
.toolbar button:hover { opacity: 0.9; }
.toolbar button.secondary {
  background: var(--editor-input-bg);
  color: var(--editor-fg);
  border: 1px solid var(--editor-border);
}
.toolbar button.secondary:hover { background: #4a4a4a; }

/* ─── Source Toggle ────────────────────────────────── */
.source-toggle {
  display: flex;
  border: 1px solid var(--editor-border);
  border-radius: 3px;
  overflow: hidden;
}
.source-toggle button {
  background: var(--editor-input-bg);
  color: var(--editor-fg);
  border: none;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  flex: 1;
  white-space: nowrap;
}
.source-toggle button + button {
  border-left: 1px solid var(--editor-border);
}
.source-toggle button.active {
  background: var(--editor-accent);
  color: white;
}
.source-toggle button:not(.active):hover { background: #4a4a4a; }
.source-toggle button:disabled {
  opacity: 0.4;
  cursor: default;
}
.source-toggle button:disabled:hover { background: var(--editor-input-bg); }
.source-label {
  font-size: 11px;
  color: #888;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  padding-top: 2px;
}

/* ─── Preview Panel ─────────────────────────────────── */
.preview {
  flex: 1;
  overflow-y: auto;
  background: white;
}
.preview-inner {
  /* Demo document styles below */
}

/* ─── Demo Document Styles ──────────────────────────── */
${demoStyles}
</style>
</head>
<body>

<div class="controls">
  <h3>Theme Studio</h3>

  <div class="toolbar">
    <button class="secondary" id="btn-export">Export</button>
    <button class="secondary" id="btn-copy-css">Copy CSS</button>
  </div>

  <!-- Preview source toggle -->
  <div class="control-group">
    <h2>Preview Source</h2>
    <div class="source-toggle">
      <button id="src-reference" class="active">Reference</button>
      <button id="src-document" ${activePolyFile ? "" : "disabled"}>My Document</button>
    </div>
    <div class="source-label" id="source-label">All themeable components</div>
  </div>

  <!-- Style preset selector -->
  <div class="control-group">
    <h2>Style Preset</h2>
    <div class="control-row">
      <select id="style-preset">
        <option value="default" selected>Default</option>
        <option value="corporate">Corporate</option>
        <option value="minimal">Minimal</option>
        <option value="playful">Playful</option>
        <option value="dark">Dark</option>
        <option value="codecargo">CodeCargo</option>
      </select>
    </div>
  </div>

  <!-- Colors -->
  <div class="control-group">
    <h2>Colors</h2>
    <div class="control-row"><label>Primary</label><input type="color" data-token="color-primary" value="#3b82f6"></div>
    <div class="control-row"><label>Primary Light</label><input type="color" data-token="color-primary-light" value="#60a5fa"></div>
    <div class="control-row"><label>Primary Dark</label><input type="color" data-token="color-primary-dark" value="#2563eb"></div>
    <div class="control-row"><label>Secondary</label><input type="color" data-token="color-secondary" value="#475569"></div>
    <div class="control-row"><label>Accent</label><input type="color" data-token="color-accent" value="#d97706"></div>
    <div class="control-row"><label>Background</label><input type="color" data-token="color-bg" value="#ffffff"></div>
    <div class="control-row"><label>Surface</label><input type="color" data-token="color-surface" value="#f9fafb"></div>
    <div class="control-row"><label>Text</label><input type="color" data-token="color-text" value="#1a1a1a"></div>
    <div class="control-row"><label>Text Muted</label><input type="color" data-token="color-text-muted" value="#666666"></div>
    <div class="control-row"><label>Border</label><input type="color" data-token="color-border" value="#e5e5e5"></div>
    <div class="control-row"><label>Link</label><input type="color" data-token="color-link" value="#3b82f6"></div>
    <div class="control-row"><label>Success</label><input type="color" data-token="color-success" value="#16a34a"></div>
    <div class="control-row"><label>Warning</label><input type="color" data-token="color-warning" value="#d97706"></div>
    <div class="control-row"><label>Error</label><input type="color" data-token="color-error" value="#dc2626"></div>
  </div>

  <!-- Typography -->
  <div class="control-group">
    <h2>Typography</h2>
    <div class="control-row">
      <label>Body</label>
      <select data-token="font-body">
        <option value="system-ui, -apple-system, sans-serif" selected>System (default)</option>
        <option value="Inter, system-ui, sans-serif">Inter</option>
        <option value="Geist, system-ui, -apple-system, sans-serif">Geist</option>
        <option value="'Nunito', system-ui, sans-serif">Nunito</option>
        <option value="Georgia, 'Times New Roman', serif">Georgia (serif)</option>
        <option value="'Lora', Georgia, serif">Lora (serif)</option>
      </select>
    </div>
    <div class="control-row">
      <label>Heading</label>
      <select data-token="font-heading">
        <option value="system-ui, -apple-system, sans-serif" selected>System (default)</option>
        <option value="Inter, system-ui, sans-serif">Inter</option>
        <option value="Geist, system-ui, -apple-system, sans-serif">Geist</option>
        <option value="'Nunito', system-ui, sans-serif">Nunito</option>
        <option value="Georgia, 'Times New Roman', serif">Georgia (serif)</option>
        <option value="'Lora', Georgia, serif">Lora (serif)</option>
      </select>
    </div>
    <div class="control-row">
      <label>Mono</label>
      <select data-token="font-mono">
        <option value="ui-monospace, monospace" selected>System mono</option>
        <option value="JetBrains Mono, ui-monospace, monospace">JetBrains Mono</option>
        <option value="Geist Mono, ui-monospace, monospace">Geist Mono</option>
        <option value="'Fira Code', ui-monospace, monospace">Fira Code</option>
        <option value="'Source Code Pro', ui-monospace, monospace">Source Code Pro</option>
      </select>
    </div>
  </div>

  <!-- Borders -->
  <div class="control-group">
    <h2>Borders</h2>
    <div class="control-row">
      <label>Radius</label>
      <input type="range" data-token="radius" min="0" max="2" step="0.05" value="0.5">
      <span class="range-value" id="val-radius">0.5rem</span>
    </div>
    <div class="control-row">
      <label>Width</label>
      <select data-token="border-width">
        <option value="1px" selected>1px</option>
        <option value="2px">2px</option>
        <option value="3px">3px</option>
      </select>
    </div>
  </div>

  <!-- Shadows -->
  <div class="control-group">
    <h2>Shadows</h2>
    <div class="control-row">
      <label>Card</label>
      <select data-token="shadow-card">
        <option value="none" selected>None</option>
        <option value="0 1px 3px rgba(0,0,0,0.1)">Subtle</option>
        <option value="0 2px 8px rgba(0,0,0,0.15)">Medium</option>
        <option value="0 4px 12px rgba(0,0,0,0.2)">Strong</option>
      </select>
    </div>
  </div>

  <!-- Hero -->
  <div class="control-group">
    <h2>Hero</h2>
    <div class="control-row">
      <label>Text Color</label>
      <input type="color" data-token="hero-text" value="#ffffff">
    </div>
  </div>

  <!-- Spacing preset -->
  <div class="control-group">
    <h2>Spacing Preset</h2>
    <div class="control-row">
      <select id="spacing-preset">
        <option value="compact">Compact</option>
        <option value="default" selected>Default</option>
        <option value="spacious">Spacious</option>
      </select>
    </div>
  </div>

  <!-- Spacing fine-tune -->
  <div class="control-group">
    <h2>Spacing</h2>
    <div class="control-row">
      <label>Base</label>
      <input type="range" data-token="spacing-base" min="0.5" max="2" step="0.05" value="1">
      <span class="range-value" id="val-spacing-base">1rem</span>
    </div>
    <div class="control-row">
      <label>Column Gap</label>
      <input type="range" data-token="spacing-column-gap" min="0.5" max="3" step="0.1" value="1.5">
      <span class="range-value" id="val-spacing-column-gap">1.5rem</span>
    </div>
    <div class="control-row">
      <label>Card Pad</label>
      <input type="range" data-token="spacing-card-padding" min="0.5" max="3" step="0.1" value="1.5">
      <span class="range-value" id="val-spacing-card-padding">1.5rem</span>
    </div>
    <div class="control-row">
      <label>Block Pad</label>
      <input type="range" data-token="spacing-block-padding" min="0.5" max="2" step="0.1" value="1">
      <span class="range-value" id="val-spacing-block-padding">1rem</span>
    </div>
  </div>
</div>

<div class="preview">
  <div class="preview-inner">
    <style id="poly-theme-vars"></style>
    ${bodyContent}
  </div>
</div>

<script>
(function() {
  const vscode = acquireVsCodeApi();

  // Token → CSS variable name mapping
  function cssVar(token) {
    return '--poly-' + token;
  }

  // Current token values (initialized from default preset)
  const tokens = {};

  // Preset data (injected from extension)
  const stylePresets = ${JSON.stringify(STYLE_PRESETS)};
  const spacingPresets = ${JSON.stringify(SPACING_PRESETS)};

  // Apply a single token to the preview
  function applyToken(token, value) {
    tokens[token] = value;
    const root = document.querySelector('.preview-inner');
    root.style.setProperty(cssVar(token), value);
  }

  // Apply all tokens in an object
  function applyAll(obj) {
    for (const [token, value] of Object.entries(obj)) {
      applyToken(token, value);
    }
  }

  // Update a control's displayed value
  function syncControl(token, value) {
    const el = document.querySelector('[data-token="' + token + '"]');
    if (!el) return;

    if (el.type === 'color') {
      el.value = value;
    } else if (el.type === 'range') {
      el.value = parseFloat(value);
      const valEl = document.getElementById('val-' + token);
      if (valEl) valEl.textContent = parseFloat(value).toFixed(2) + 'rem';
    } else if (el.tagName === 'SELECT') {
      // Try to match by value
      for (const opt of el.options) {
        if (opt.value === value) { el.value = value; return; }
      }
      // No match — just set first option
    }
  }

  // Load a style preset: apply tokens + update controls
  function loadStylePreset(name) {
    const preset = stylePresets[name];
    if (!preset) return;
    applyAll(preset);
    for (const [token, value] of Object.entries(preset)) {
      syncControl(token, value);
    }
  }

  // Load a spacing preset
  function loadSpacingPreset(name) {
    const preset = spacingPresets[name];
    if (!preset) return;
    applyAll(preset);
    for (const [token, value] of Object.entries(preset)) {
      syncControl(token, value);
    }
  }

  // Generate CSS :root block from current tokens
  function generateCSS() {
    let css = ':root {\\n';
    for (const [token, value] of Object.entries(tokens)) {
      css += '  ' + cssVar(token) + ': ' + value + ';\\n';
    }
    css += '}';
    return css;
  }

  // Generate a Polyester style JSON
  function generateStyleJSON(name) {
    return {
      name: name,
      colors: {
        primary: tokens['color-primary'] || '#3b82f6',
        'primary-light': tokens['color-primary-light'] || '#60a5fa',
        'primary-dark': tokens['color-primary-dark'] || '#2563eb',
        secondary: tokens['color-secondary'] || '#475569',
        accent: tokens['color-accent'] || '#d97706',
        background: tokens['color-bg'] || '#ffffff',
        surface: tokens['color-surface'] || '#f9fafb',
        text: tokens['color-text'] || '#1a1a1a',
        'text-muted': tokens['color-text-muted'] || '#666666',
        border: tokens['color-border'] || '#e5e5e5',
        link: tokens['color-link'] || '#3b82f6',
        success: tokens['color-success'] || '#16a34a',
        warning: tokens['color-warning'] || '#d97706',
        error: tokens['color-error'] || '#dc2626',
      },
      fonts: {
        body: tokens['font-body'] || 'system-ui, -apple-system, sans-serif',
        heading: tokens['font-heading'] || 'system-ui, -apple-system, sans-serif',
        mono: tokens['font-mono'] || 'ui-monospace, monospace',
      },
      borders: {
        radius: tokens['radius'] ? tokens['radius'] : '0.5rem',
        width: tokens['border-width'] || '1px',
      },
      shadows: {
        card: tokens['shadow-card'] || 'none',
        elevated: tokens['shadow-elevated'] || '0 4px 12px rgba(0,0,0,0.1)',
      },
      hero: {
        gradient: tokens['hero-gradient'] || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'text-color': tokens['hero-text'] || '#ffffff',
      },
    };
  }

  // ─── Event listeners ─────────────────────────────────

  // Style preset selector
  document.getElementById('style-preset').addEventListener('change', function(e) {
    loadStylePreset(e.target.value);
  });

  // Spacing preset selector
  document.getElementById('spacing-preset').addEventListener('change', function(e) {
    loadSpacingPreset(e.target.value);
  });

  // All input controls
  document.querySelectorAll('[data-token]').forEach(function(el) {
    const token = el.dataset.token;
    const event = el.type === 'range' ? 'input' : 'change';
    el.addEventListener(event, function() {
      let value = el.value;
      // Range sliders produce rem values
      if (el.type === 'range') {
        value = parseFloat(el.value).toFixed(2) + 'rem';
        const valEl = document.getElementById('val-' + token);
        if (valEl) valEl.textContent = value;
      }
      applyToken(token, value);
    });
  });

  // Export button
  document.getElementById('btn-export').addEventListener('click', function() {
    vscode.postMessage({ command: 'export', style: generateStyleJSON('custom'), tokens: tokens });
  });

  // Copy CSS button
  document.getElementById('btn-copy-css').addEventListener('click', function() {
    vscode.postMessage({ command: 'copyCSS', css: generateCSS() });
  });

  // ─── Source toggle ──────────────────────────────────
  let currentSource = 'reference';
  const btnReference = document.getElementById('src-reference');
  const btnDocument = document.getElementById('src-document');
  const sourceLabel = document.getElementById('source-label');

  function setActiveSource(source) {
    currentSource = source;
    btnReference.classList.toggle('active', source === 'reference');
    btnDocument.classList.toggle('active', source === 'document');
  }

  function replacePreviewContent(bodyHtml, stylesHtml) {
    // Replace styles
    const previewInner = document.querySelector('.preview-inner');
    const themeVars = document.getElementById('poly-theme-vars');
    const savedVars = themeVars ? themeVars.textContent : '';

    // Find and replace the demo styles block
    const existingStyle = previewInner.querySelector('style:not(#poly-theme-vars)');
    if (existingStyle) existingStyle.remove();

    // Insert new styles
    const newStyle = document.createElement('style');
    newStyle.textContent = stylesHtml;
    previewInner.insertBefore(newStyle, themeVars.nextSibling);

    // Replace body content (keep the two style tags)
    const children = Array.from(previewInner.children);
    children.forEach(function(child) {
      if (child.tagName !== 'STYLE') child.remove();
    });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = bodyHtml;
    while (wrapper.firstChild) {
      previewInner.appendChild(wrapper.firstChild);
    }

    // Re-apply current tokens
    const root = previewInner;
    for (const [token, value] of Object.entries(tokens)) {
      root.style.setProperty(cssVar(token), value);
    }
  }

  btnReference.addEventListener('click', function() {
    if (currentSource === 'reference') return;
    setActiveSource('reference');
    vscode.postMessage({ command: 'switchSource', source: 'reference' });
  });

  btnDocument.addEventListener('click', function() {
    if (currentSource === 'document' || btnDocument.disabled) return;
    setActiveSource('document');
    vscode.postMessage({ command: 'switchSource', source: 'document' });
  });

  // Messages from extension
  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.type === 'loadPreset') {
      if (msg.stylePreset) loadStylePreset(msg.stylePreset);
      if (msg.spacingPreset) loadSpacingPreset(msg.spacingPreset);
    }
    if (msg.type === 'updatePreview') {
      replacePreviewContent(msg.body, msg.styles);
      if (msg.label) sourceLabel.textContent = msg.label;
    }
    if (msg.type === 'activeFileChanged') {
      btnDocument.disabled = !msg.available;
      if (msg.fileName) {
        btnDocument.textContent = msg.fileName;
      } else {
        btnDocument.textContent = 'My Document';
      }
      // If we're on document view and the file changed, refresh
      if (currentSource === 'document' && msg.available) {
        vscode.postMessage({ command: 'switchSource', source: 'document' });
      }
    }
  });

  // Initialize with default preset
  loadStylePreset('default');
  loadSpacingPreset('default');
})();
</script>
</body>
</html>`;
}

// ─── Public API ────────────────────────────────────────────────

/** Find the active .poly file, if any */
function getActivePolyFile(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === "polyester") {
    return editor.document.uri.fsPath;
  }
  // Check all visible editors
  for (const ve of vscode.window.visibleTextEditors) {
    if (ve.document.languageId === "polyester") {
      return ve.document.uri.fsPath;
    }
  }
  return null;
}

export async function openThemeEditor(context: vscode.ExtensionContext): Promise<void> {
  if (editorPanel) {
    editorPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  cachedExtensionPath = context.extensionPath;
  const demoHtml = await compileDemoHtml(context);
  const activePolyFile = getActivePolyFile();

  editorPanel = vscode.window.createWebviewPanel(
    "polyesterThemeEditor",
    "Theme Studio",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  editorPanel.webview.html = buildEditorHtml(demoHtml, activePolyFile);

  // Cache compiled HTML to avoid recompiling on every toggle
  let cachedDemoParts = extractHtmlParts(demoHtml);
  let cachedDocParts: { body: string; styles: string } | null = null;
  let cachedDocPath: string | null = null;

  /** Compile a user document and cache it */
  async function compileUserDoc(filePath: string): Promise<{ body: string; styles: string }> {
    if (filePath === cachedDocPath && cachedDocParts) { return cachedDocParts; }
    const html = await compilePolyFile(filePath);
    cachedDocParts = extractHtmlParts(html);
    cachedDocPath = filePath;
    return cachedDocParts;
  }

  // Handle messages from webview
  editorPanel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case "switchSource": {
        if (message.source === "reference") {
          editorPanel?.webview.postMessage({
            type: "updatePreview",
            body: cachedDemoParts.body,
            styles: cachedDemoParts.styles,
            label: "All themeable components",
          });
        } else if (message.source === "document") {
          const polyFile = getActivePolyFile();
          if (!polyFile) { return; }
          const parts = await compileUserDoc(polyFile);
          editorPanel?.webview.postMessage({
            type: "updatePreview",
            body: parts.body,
            styles: parts.styles,
            label: path.basename(polyFile),
          });
        }
        break;
      }

      case "export": {
        const name = await vscode.window.showInputBox({
          prompt: "Style name",
          value: "custom",
          validateInput: (v) => v.trim() ? null : "Name is required",
        });
        if (!name) { return; }

        const style = { ...message.style, name };
        const dir = path.join(homedir(), ".config", "polyester", "styles");
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        const filePath = path.join(dir, `${name}.json`);
        fs.writeFileSync(filePath, JSON.stringify(style, null, 2));

        const action = await vscode.window.showInformationMessage(
          `Style "${name}" saved to ${filePath}`,
          "Open File"
        );
        if (action === "Open File") {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        }
        break;
      }

      case "copyCSS": {
        await vscode.env.clipboard.writeText(message.css);
        vscode.window.showInformationMessage("CSS copied to clipboard");
        break;
      }
    }
  });

  // Track active editor changes — notify webview when a .poly file becomes available
  const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((_editor) => {
    if (!editorPanel) { return; }
    const polyFile = getActivePolyFile();
    editorPanel.webview.postMessage({
      type: "activeFileChanged",
      available: !!polyFile,
      fileName: polyFile ? path.basename(polyFile) : null,
    });
    // Invalidate doc cache when switching files
    if (polyFile !== cachedDocPath) {
      cachedDocParts = null;
      cachedDocPath = null;
    }
  });

  // Also recompile when user saves their document
  const saveDisposable = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (!editorPanel || doc.languageId !== "polyester") { return; }
    // Invalidate cache for saved file
    if (doc.uri.fsPath === cachedDocPath) {
      cachedDocParts = null;
      cachedDocPath = null;
    }
    // If we're previewing this document, refresh automatically
    // (webview will request via switchSource on its own if needed)
  });

  editorPanel.onDidDispose(() => {
    editorPanel = undefined;
    editorChangeDisposable.dispose();
    saveDisposable.dispose();
  });
}

export function disposeThemeEditor(): void {
  if (editorPanel) {
    editorPanel.dispose();
  }
}
