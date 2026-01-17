/**
 * Polyester Configuration
 *
 * Handles loading and saving global config from ~/.config/polyester/config.toml
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "polyester");
const CONFIG_FILE = join(CONFIG_DIR, "config.toml");

export interface PolyesterConfig {
  /** Default theme for syntax highlighting */
  defaultTheme: string;
}

const DEFAULT_CONFIG: PolyesterConfig = {
  defaultTheme: "default",
};

/**
 * Simple TOML parser for flat key = value format
 */
function parseSimpleToml(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;

    const match = trimmed.match(/^(\w+)\s*=\s*"?([^"]*)"?$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

/**
 * Load config from disk
 */
export function loadConfig(): PolyesterConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    const data = parseSimpleToml(content);

    return {
      defaultTheme: data.default_theme || DEFAULT_CONFIG.defaultTheme,
    };
  } catch (err) {
    console.warn(`Warning: Could not read config file: ${(err as Error).message}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the config file path
 */
export function getConfigFile(): string {
  return CONFIG_FILE;
}
