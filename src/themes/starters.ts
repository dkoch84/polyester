/**
 * Built-in Style & Spacing Presets
 *
 * These are available without any filesystem files.
 * Users reference them by name: --style corporate, --spacing compact, etc.
 */

import type { StyleTokens, SpacingTokens } from "./types.js";

// ─── Style Presets ─────────────────────────────────────────────

const corporate: StyleTokens = {
  name: "corporate",
  colors: {
    primary: "#1e40af",
    "primary-light": "#3b82f6",
    "primary-dark": "#1e3a8a",
    secondary: "#475569",
    accent: "#d97706",
    background: "#ffffff",
    surface: "#f8fafc",
    text: "#0f172a",
    "text-muted": "#64748b",
    border: "#cbd5e1",
    link: "#1e40af",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
  },
  fonts: {
    body: "Inter, system-ui, sans-serif",
    heading: "Inter, system-ui, sans-serif",
    mono: "JetBrains Mono, ui-monospace, monospace",
  },
  borders: { radius: "0.25rem", width: "1px" },
  shadows: { card: "0 1px 3px rgba(0,0,0,0.1)", elevated: "0 4px 12px rgba(0,0,0,0.15)" },
  hero: {
    gradient: "linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)",
    "text-color": "#ffffff",
  },
};

const minimal: StyleTokens = {
  name: "minimal",
  colors: {
    primary: "#18181b",
    "primary-light": "#3f3f46",
    "primary-dark": "#09090b",
    secondary: "#71717a",
    accent: "#18181b",
    background: "#ffffff",
    surface: "#fafafa",
    text: "#18181b",
    "text-muted": "#a1a1aa",
    border: "#e4e4e7",
    link: "#18181b",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
  },
  fonts: {
    body: "system-ui, -apple-system, sans-serif",
    heading: "system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, monospace",
  },
  borders: { radius: "0.25rem", width: "1px" },
  shadows: { card: "none", elevated: "0 2px 8px rgba(0,0,0,0.08)" },
  hero: {
    gradient: "linear-gradient(135deg, #18181b 0%, #3f3f46 100%)",
    "text-color": "#ffffff",
  },
};

const playful: StyleTokens = {
  name: "playful",
  colors: {
    primary: "#8b5cf6",
    "primary-light": "#a78bfa",
    "primary-dark": "#7c3aed",
    secondary: "#06b6d4",
    accent: "#f59e0b",
    background: "#fffbeb",
    surface: "#fef3c7",
    text: "#1c1917",
    "text-muted": "#78716c",
    border: "#fcd34d",
    link: "#8b5cf6",
    success: "#22c55e",
    warning: "#f59e0b",
    error: "#ef4444",
  },
  fonts: {
    body: "'Nunito', system-ui, sans-serif",
    heading: "'Nunito', system-ui, sans-serif",
    mono: "'Fira Code', ui-monospace, monospace",
  },
  borders: { radius: "1rem", width: "2px" },
  shadows: { card: "0 2px 8px rgba(139,92,246,0.15)", elevated: "0 8px 24px rgba(139,92,246,0.2)" },
  hero: {
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #06b6d4 50%, #f59e0b 100%)",
    "text-color": "#ffffff",
  },
};

const dark: StyleTokens = {
  name: "dark",
  colors: {
    primary: "#60a5fa",
    "primary-light": "#93c5fd",
    "primary-dark": "#3b82f6",
    secondary: "#94a3b8",
    accent: "#fbbf24",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#e2e8f0",
    "text-muted": "#94a3b8",
    border: "#334155",
    link: "#60a5fa",
    success: "#4ade80",
    warning: "#fbbf24",
    error: "#f87171",
  },
  fonts: {
    body: "system-ui, -apple-system, sans-serif",
    heading: "system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, monospace",
  },
  borders: { radius: "0.5rem", width: "1px" },
  shadows: { card: "0 2px 8px rgba(0,0,0,0.3)", elevated: "0 8px 24px rgba(0,0,0,0.4)" },
  hero: {
    gradient: "linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)",
    "text-color": "#e2e8f0",
  },
};

export const BUILTIN_STYLES: Record<string, StyleTokens> = {
  corporate,
  minimal,
  playful,
  dark,
};

// ─── Spacing Presets ───────────────────────────────────────────

const compact: SpacingTokens = {
  name: "compact",
  base: "0.75rem",
  "page-margin": "1.5cm",
  "section-gap": "1rem",
  "column-gap": "1rem",
  "card-padding": "1rem",
  "block-padding": "0.75rem",
};

const defaultSpacing: SpacingTokens = {
  name: "default",
  base: "1rem",
  "page-margin": "2cm",
  "section-gap": "2rem",
  "column-gap": "1.5rem",
  "card-padding": "1.5rem",
  "block-padding": "1rem",
};

const spacious: SpacingTokens = {
  name: "spacious",
  base: "1.25rem",
  "page-margin": "3cm",
  "section-gap": "3rem",
  "column-gap": "2rem",
  "card-padding": "2rem",
  "block-padding": "1.5rem",
};

export const BUILTIN_SPACING: Record<string, SpacingTokens> = {
  compact,
  default: defaultSpacing,
  spacious,
};

export function getBuiltinStyleNames(): string[] {
  return Object.keys(BUILTIN_STYLES);
}

export function getBuiltinSpacingNames(): string[] {
  return Object.keys(BUILTIN_SPACING);
}
