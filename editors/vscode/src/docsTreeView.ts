/**
 * Documentation Tree View
 *
 * Provides a sidebar tree view for browsing Polyester components
 * organized by category. Loads component data dynamically from the CLI.
 */

import * as vscode from "vscode";
import * as path from "path";
import { execSync } from "child_process";
import { REFERENCE_SECTIONS, ReferenceSection, CATEGORY_SECTIONS, CategorySection } from "./glossary";

export interface ComponentInfo {
  name: string;
  description: string;
  category: "layout" | "content" | "style" | "interactive";
  args: Array<{ name: string; description: string; required?: boolean; default?: string }>;
  flags: Array<{ name: string; short?: string; description: string; hasValue?: boolean; default?: string; values?: string[] }>;
  examples: string[];
  hasBlock?: boolean;
}

// Cached component data
let cachedComponents: ComponentInfo[] | null = null;

/**
 * Get CLI path from config or workspace
 */
function getCliPath(): string {
  const config = vscode.workspace.getConfiguration("polyester");
  const configPath = config.get<string>("cliPath");
  if (configPath) {
    return configPath;
  }

  // Try workspace folder first (for development)
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const candidate = path.join(folder.uri.fsPath, "dist", "cli", "index.js");
      try {
        require.resolve(candidate);
        return candidate;
      } catch {
        // Not found, continue
      }
    }
  }

  // Try extension's parent directory (when installed from the polyester project)
  const extensionPath = path.join(__dirname, "..", "..", "..", "dist", "cli", "index.js");
  try {
    require.resolve(extensionPath);
    return extensionPath;
  } catch {
    // Not found
  }

  // Fallback: assume poly is in PATH
  return "poly";
}

/**
 * Load component data from the CLI
 */
export function loadComponents(): ComponentInfo[] {
  if (cachedComponents) {
    return cachedComponents;
  }

  try {
    const cliPath = getCliPath();
    const cmd = cliPath === "poly"
      ? "poly help --json"
      : `node "${cliPath}" help --json`;

    const output = execSync(cmd, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    cachedComponents = JSON.parse(output) as ComponentInfo[];
    return cachedComponents;
  } catch (err) {
    console.error("Failed to load components from CLI:", err);
    // Return empty array - UI will show "No components found"
    return [];
  }
}

/**
 * Reload component data (clear cache)
 */
export function reloadComponents(): ComponentInfo[] {
  cachedComponents = null;
  return loadComponents();
}

/**
 * Tree item representing a category, component, or reference section
 */
export class DocsTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly component?: ComponentInfo,
    public readonly category?: string,
    public readonly referenceSection?: ReferenceSection,
    public readonly isReferenceRoot?: boolean,
    public readonly categorySection?: CategorySection
  ) {
    super(label, collapsibleState);

    if (component) {
      this.description = component.description;
      this.tooltip = new vscode.MarkdownString(`**/${component.name}**\n\n${component.description}`);
      this.iconPath = new vscode.ThemeIcon("symbol-function");
      this.command = {
        command: "polyester.showComponentDocs",
        title: "Show Documentation",
        arguments: [component],
      };
      this.contextValue = "component";
    } else if (referenceSection) {
      this.iconPath = new vscode.ThemeIcon(referenceSection.icon);
      this.command = {
        command: "polyester.showReferenceDocs",
        title: "Show Reference",
        arguments: [referenceSection],
      };
      this.contextValue = "reference-section";
    } else if (isReferenceRoot) {
      this.iconPath = new vscode.ThemeIcon("book");
      this.contextValue = "reference-root";
    } else if (category && categorySection) {
      // Category with associated overview docs
      this.iconPath = new vscode.ThemeIcon(getCategoryIcon(category));
      this.tooltip = new vscode.MarkdownString(`**${categorySection.title}**\n\nClick to see overview of ${category} components.`);
      this.command = {
        command: "polyester.showCategoryDocs",
        title: "Show Category Overview",
        arguments: [categorySection],
      };
      this.contextValue = "category";
    } else if (category) {
      this.iconPath = new vscode.ThemeIcon(getCategoryIcon(category));
      this.contextValue = "category";
    }
  }
}

function getCategoryIcon(category: string): string {
  switch (category) {
    case "layout": return "layout";
    case "content": return "file-text";
    case "style": return "paintcan";
    case "interactive": return "play";
    default: return "folder";
  }
}

/**
 * Tree data provider for the documentation view
 */
export class DocsTreeProvider implements vscode.TreeDataProvider<DocsTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DocsTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: DocsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: DocsTreeItem): Thenable<DocsTreeItem[]> {
    const components = loadComponents();

    if (!element) {
      // Root level - return categories + Reference section
      const categories = ["layout", "content", "style", "interactive"];
      const categoryItems = categories.map(cat => {
        const catSection = CATEGORY_SECTIONS.find(s => s.category === cat);
        return new DocsTreeItem(
          cat.charAt(0).toUpperCase() + cat.slice(1),
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          cat,
          undefined,
          undefined,
          catSection
        );
      });

      // Add Reference section at the end
      const referenceItem = new DocsTreeItem(
        "Designer's Reference",
        vscode.TreeItemCollapsibleState.Collapsed,
        undefined,
        undefined,
        undefined,
        true
      );

      return Promise.resolve([...categoryItems, referenceItem]);
    } else if (element.isReferenceRoot) {
      // Reference root - return reference sections
      return Promise.resolve(
        REFERENCE_SECTIONS.map(section => new DocsTreeItem(
          section.title,
          vscode.TreeItemCollapsibleState.None,
          undefined,
          undefined,
          section
        ))
      );
    } else if (element.category) {
      // Category level - return components in this category
      const filtered = components.filter(c => c.category === element.category);
      return Promise.resolve(
        filtered.map(comp => new DocsTreeItem(
          `/${comp.name}`,
          vscode.TreeItemCollapsibleState.None,
          comp
        ))
      );
    }
    return Promise.resolve([]);
  }

  refresh(): void {
    reloadComponents();
    this._onDidChangeTreeData.fire(undefined);
  }
}
