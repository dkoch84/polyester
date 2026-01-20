/**
 * Component Registry
 *
 * Central source of truth for all component metadata.
 * Used by CLI help, LSP completions, and documentation.
 */

export interface ArgDef {
  name: string;
  description: string;
  required?: boolean;
  default?: string;
}

export interface FlagDef {
  name: string;
  short?: string;
  description: string;
  hasValue?: boolean;
  default?: string;
  values?: string[]; // Allowed values for enumerated options
}

export interface ComponentDef {
  name: string;
  description: string;
  category: "layout" | "content" | "style" | "interactive";
  args: ArgDef[];
  flags: FlagDef[];
  examples: string[];
  hasBlock?: boolean; // Whether component accepts a block { ... }
}

/**
 * All built-in components with full metadata
 */
export const COMPONENTS: ComponentDef[] = [
  // ======== Layout Components ========
  {
    name: "page",
    description: "Set up document page properties (size, margins, orientation).",
    category: "layout",
    args: [
      { name: "size", description: "Page size (A4, letter, legal, etc.)", default: "A4" },
    ],
    flags: [
      { name: "margin", description: "Page margins", hasValue: true, default: "2cm" },
      { name: "landscape", description: "Use landscape orientation" },
    ],
    examples: [
      "/page A4 --margin 2cm",
      "/page letter --landscape",
    ],
    hasBlock: false,
  },
  {
    name: "columns",
    description: "Create a multi-column layout with optional custom ratios.",
    category: "layout",
    args: [
      { name: "spec", description: "Number of columns or ratio string (e.g., '2' or '60 40' or '1fr 2fr')", default: "2" },
    ],
    flags: [
      { name: "gap", short: "g", description: "Gap between columns", hasValue: true, default: "1.5rem" },
    ],
    examples: [
      "/columns 2 { content }",
      "/columns 3 --gap 2rem { ... }",
      '/columns "60 40" { ... }',
      '/columns "1fr 2fr" { ... }',
    ],
    hasBlock: true,
  },
  {
    name: "grid",
    description: "Create a CSS grid layout with custom column sizes.",
    category: "layout",
    args: [
      { name: "template", description: "Grid column template (CSS grid-template-columns)", default: "1fr 1fr" },
    ],
    flags: [
      { name: "gap", description: "Gap between grid cells", hasValue: true, default: "1rem" },
    ],
    examples: [
      '/grid "1fr 2fr" { ... }',
      '/grid "1fr 1fr 1fr" --gap 2rem { ... }',
    ],
    hasBlock: true,
  },
  {
    name: "region",
    description: "Create a styled container region.",
    category: "layout",
    args: [],
    flags: [
      { name: "bg", description: "Background color", hasValue: true },
      { name: "padding", short: "p", description: "Inner padding", hasValue: true },
      { name: "margin", short: "m", description: "Outer margin", hasValue: true },
    ],
    examples: [
      "/region --bg #f0f0f0 --padding 2rem { content }",
      "/region -p 1rem -m 1rem { ... }",
    ],
    hasBlock: true,
  },
  {
    name: "sidebar",
    description: "Create a positioned sidebar element.",
    category: "layout",
    args: [
      { name: "position", description: "Position (left, right)", default: "left" },
    ],
    flags: [
      { name: "rotate", description: "Rotation angle", hasValue: true },
    ],
    examples: [
      "/sidebar left { content }",
      "/sidebar right --rotate 90deg { ... }",
    ],
    hasBlock: true,
  },
  {
    name: "center",
    description: "Center content horizontally.",
    category: "layout",
    args: [],
    flags: [],
    examples: [
      "/center { content }",
    ],
    hasBlock: true,
  },
  {
    name: "vcenter",
    description: "Center content both vertically and horizontally.",
    category: "layout",
    args: [],
    flags: [
      { name: "height", short: "h", description: "Container height", hasValue: true, default: "100%" },
    ],
    examples: [
      "/vcenter { content }",
      "/vcenter --height 50vh { ... }",
    ],
    hasBlock: true,
  },
  {
    name: "frame",
    description: "Create a bordered frame/box container.",
    category: "layout",
    args: [],
    flags: [
      { name: "border", short: "b", description: "Border style (e.g., 2px solid #333)", hasValue: true, default: "1px solid #e5e5e5" },
      { name: "radius", short: "r", description: "Border radius", hasValue: true, default: "4px" },
      { name: "padding", short: "p", description: "Inner padding", hasValue: true, default: "1rem" },
      { name: "bg", description: "Background color", hasValue: true },
    ],
    examples: [
      "/frame { content }",
      '/frame --border "2px solid blue" --radius 8px { ... }',
      "/frame -p 2rem --bg #f9f9f9 { ... }",
    ],
    hasBlock: true,
  },

  // ======== Content Components ========
  {
    name: "text",
    description: "Style inline text with colors, size, weight, etc.",
    category: "content",
    args: [
      { name: "content", description: "Text content", required: true },
    ],
    flags: [
      { name: "color", short: "c", description: "Text color", hasValue: true },
      { name: "size", description: "Font size", hasValue: true },
      { name: "bold", short: "b", description: "Make text bold" },
      { name: "italic", short: "i", description: "Make text italic" },
      { name: "rotate", description: "Rotate text", hasValue: true },
      { name: "tracking", description: "Letter spacing (or 'wide')", hasValue: true },
    ],
    examples: [
      '/text "Hello" --bold --color red',
      '/text "IMPORTANT" --tracking wide --size 2rem',
    ],
    hasBlock: false,
  },
  {
    name: "quote",
    description: "Create a blockquote or pull quote.",
    category: "content",
    args: [
      { name: "style", description: "Quote style (pull, pullquote, or blank for block)" },
      { name: "content", description: "Quote text (or use block)" },
    ],
    flags: [],
    examples: [
      '/quote pull "The only way out is through."',
      "/quote { Long quote content... }",
    ],
    hasBlock: true,
  },
  {
    name: "code",
    description: "Enhanced code block with line numbers and language tag.",
    category: "content",
    args: [
      { name: "language", description: "Programming language for syntax highlighting" },
    ],
    flags: [
      { name: "lines", short: "l", description: "Show line numbers" },
      { name: "start", description: "Starting line number", hasValue: true, default: "1" },
      { name: "highlight", description: "Lines to highlight (e.g., 1,3-5)", hasValue: true },
      { name: "title", short: "t", description: "Code block title/filename", hasValue: true },
    ],
    examples: [
      "/code typescript --lines { const x = 1; }",
      '/code python --title "main.py" --highlight 2-3 { ... }',
      "/code bash { echo hello }",
    ],
    hasBlock: true,
  },
  {
    name: "table",
    description: "Create a styled table with headers and alignment.",
    category: "content",
    args: [],
    flags: [
      { name: "header", description: "First row is header" },
      { name: "striped", description: "Alternate row colors" },
      { name: "bordered", description: "Show cell borders" },
      { name: "dark", description: "Dark mode styling for use on dark backgrounds" },
      { name: "align", description: "Column alignments (l=left, c=center, r=right)", hasValue: true },
    ],
    examples: [
      "/table --header --striped {\n  Name | Age | City\n  John | 30 | NYC\n}",
      "/table --header --dark { ... }",
    ],
    hasBlock: true,
  },
  {
    name: "list",
    description: "Create a list with custom markers/icons.",
    category: "content",
    args: [],
    flags: [
      { name: "marker", short: "m", description: "Custom marker character", hasValue: true, default: "-" },
      { name: "ordered", short: "o", description: "Create ordered (numbered) list" },
      { name: "start", description: "Starting number for ordered list", hasValue: true, default: "1" },
    ],
    examples: [
      '/list --marker ">" { item 1\nitem 2 }',
      "/list --ordered { first\nsecond }",
    ],
    hasBlock: true,
  },
  {
    name: "checkbox",
    description: "Create a checkbox item for task lists.",
    category: "content",
    args: [
      { name: "label", description: "Checkbox label text", required: true },
    ],
    flags: [
      { name: "checked", short: "x", description: "Mark as checked/completed" },
    ],
    examples: [
      '/checkbox "Buy groceries"',
      '/checkbox "Write report" --checked',
    ],
    hasBlock: false,
  },
  {
    name: "image",
    description: "Insert an image with sizing, positioning, and shape options.",
    category: "content",
    args: [
      { name: "path", description: "Image file path or URL", required: true },
    ],
    flags: [
      { name: "width", short: "w", description: "Image width", hasValue: true },
      { name: "height", short: "h", description: "Image height", hasValue: true },
      { name: "alt", description: "Alt text for accessibility", hasValue: true },
      { name: "caption", description: "Image caption", hasValue: true },
      { name: "align", description: "Alignment (left, center, right)", hasValue: true, default: "center" },
      { name: "shape", description: "Image shape (square, circle, rounded)", hasValue: true, default: "square", values: ["square", "circle", "rounded"] },
      { name: "size", short: "s", description: "Size for circle/square images (sets both width and height)", hasValue: true },
    ],
    examples: [
      '/image "photo.jpg" --width 50%',
      '/image "diagram.png" --caption "Figure 1" --align center',
      '/image "avatar.jpg" --shape circle --size 100px',
    ],
    hasBlock: false,
  },

  // ======== Style Components ========
  {
    name: "hero",
    description: "Create a hero section with centered content.",
    category: "style",
    args: [],
    flags: [
      { name: "bg", description: "Background color or 'gradient'", hasValue: true },
    ],
    examples: [
      "/hero --bg blue { # Welcome }",
      "/hero --bg gradient { content }",
    ],
    hasBlock: true,
  },
  {
    name: "card",
    description: "Create a card component with optional icon.",
    category: "style",
    args: [],
    flags: [
      { name: "icon", description: "Icon name or emoji", hasValue: true, values: ["rocket", "shield", "heart", "star", "check", "bolt"] },
      { name: "title", description: "Card title", hasValue: true },
    ],
    examples: [
      "/card --icon rocket { content }",
      "/card --title Features { ... }",
    ],
    hasBlock: true,
  },
  {
    name: "button",
    description: "Create a button element.",
    category: "style",
    args: [
      { name: "variant", description: "Button variant (primary, secondary)" },
      { name: "label", description: "Button label text" },
    ],
    flags: [
      { name: "href", description: "Link URL for button", hasValue: true },
    ],
    examples: [
      '/button primary "Click me"',
      '/button secondary "Cancel" --href "/back"',
    ],
    hasBlock: false,
  },
  {
    name: "shape",
    description: "Draw a basic shape (circle, rect, line).",
    category: "style",
    args: [
      { name: "type", description: "Shape type (circle, rect, line)", required: true },
    ],
    flags: [
      { name: "size", short: "s", description: "Shape size (width or diameter)", hasValue: true, default: "100px" },
      { name: "width", short: "w", description: "Shape width (for rect)", hasValue: true },
      { name: "height", short: "h", description: "Shape height (for rect)", hasValue: true },
      { name: "fill", short: "f", description: "Fill color", hasValue: true },
      { name: "stroke", description: "Stroke/border color", hasValue: true },
      { name: "stroke-width", description: "Stroke width", hasValue: true, default: "1px" },
    ],
    examples: [
      "/shape circle --size 50px --fill red",
      "/shape rect --width 100px --height 50px --fill blue",
      "/shape line --width 200px --stroke black",
    ],
    hasBlock: false,
  },

  // ======== Interactive Components ========
  {
    name: "fold",
    description: "Create a collapsible/accordion section.",
    category: "interactive",
    args: [
      { name: "title", description: "Section title (shown when collapsed)", required: true },
    ],
    flags: [
      { name: "open", description: "Start expanded" },
    ],
    examples: [
      '/fold "Click to expand" { hidden content }',
      '/fold "Details" --open { visible content }',
    ],
    hasBlock: true,
  },
  {
    name: "style",
    description: "Inject custom CSS into the document.",
    category: "style",
    args: [],
    flags: [],
    examples: [
      "/style { .my-class { color: red; } }",
      "/style { .poly-code-block pre { background: #282828; } }",
    ],
    hasBlock: true,
  },

  // ======== New Resume/Document Components ========
  {
    name: "icon",
    description: "Display a Lucide icon inline.",
    category: "content",
    args: [
      { name: "name", description: "Icon name (e.g., mail, github, phone)", required: true },
    ],
    flags: [
      { name: "size", short: "s", description: "Icon size", hasValue: true, default: "1em" },
      { name: "color", short: "c", description: "Icon color", hasValue: true, default: "currentColor" },
    ],
    examples: [
      "/icon mail",
      "/icon github --size 1.5rem --color blue",
      "/icon phone -c gray",
    ],
    hasBlock: false,
  },
  {
    name: "inline",
    description: "Arrange children horizontally in a row.",
    category: "layout",
    args: [],
    flags: [
      { name: "gap", short: "g", description: "Gap between items", hasValue: true, default: "0.5rem" },
      { name: "align", short: "a", description: "Vertical alignment (start, center, end, baseline)", hasValue: true, default: "center", values: ["start", "center", "end", "baseline"] },
      { name: "wrap", short: "w", description: "Wrap items to next line when needed" },
    ],
    examples: [
      "/inline { /icon mail /text \"email@example.com\" }",
      "/inline --gap 1rem --align center { content }",
      "/inline --wrap { /tag \"A\" /tag \"B\" /tag \"C\" }",
    ],
    hasBlock: true,
  },
  {
    name: "tag",
    description: "Display a badge/pill/tag element.",
    category: "content",
    args: [
      { name: "label", description: "Tag text", required: true },
    ],
    flags: [
      { name: "color", short: "c", description: "Tag color", hasValue: true },
      { name: "variant", short: "v", description: "Style variant (filled, outline)", hasValue: true, default: "filled", values: ["filled", "outline"] },
    ],
    examples: [
      '/tag "Docker"',
      '/tag "Kubernetes" --color blue',
      '/tag "AWS" --variant outline',
    ],
    hasBlock: false,
  },
  {
    name: "progress",
    description: "Display a progress/rating visualization.",
    category: "content",
    args: [
      { name: "value", description: "Current value", required: true },
    ],
    flags: [
      { name: "max", short: "m", description: "Maximum value", hasValue: true, default: "5" },
      { name: "style", short: "s", description: "Display style (circles, bar)", hasValue: true, default: "circles", values: ["circles", "bar"] },
      { name: "color", short: "c", description: "Fill color", hasValue: true },
      { name: "empty-color", description: "Empty indicator color", hasValue: true },
    ],
    examples: [
      "/progress 4",
      "/progress 4.5 --max 5 --style circles",
      "/progress 80 --max 100 --style bar --color green",
    ],
    hasBlock: false,
  },
  {
    name: "divider",
    description: "Insert a horizontal divider/separator.",
    category: "layout",
    args: [],
    flags: [
      { name: "style", short: "s", description: "Line style (solid, dashed, dotted)", hasValue: true, default: "solid", values: ["solid", "dashed", "dotted"] },
      { name: "color", short: "c", description: "Line color", hasValue: true },
      { name: "margin", short: "m", description: "Vertical margin", hasValue: true, default: "1rem" },
      { name: "width", short: "w", description: "Line width/thickness", hasValue: true, default: "1px" },
    ],
    examples: [
      "/divider",
      "/divider --style dashed --color gray",
      "/divider --margin 2rem --width 2px",
    ],
    hasBlock: false,
  },
];

/**
 * Get component definition by name
 */
export function getComponent(name: string): ComponentDef | undefined {
  return COMPONENTS.find((c) => c.name === name);
}

/**
 * Get all component names
 */
export function getComponentNames(): string[] {
  return COMPONENTS.map((c) => c.name);
}

/**
 * Get components by category
 */
export function getComponentsByCategory(category: ComponentDef["category"]): ComponentDef[] {
  return COMPONENTS.filter((c) => c.category === category);
}

/**
 * Format component help for CLI output
 */
export function formatComponentHelp(def: ComponentDef): string {
  const lines: string[] = [];

  lines.push(`/${def.name} - ${def.description}`);
  lines.push("");

  // Arguments
  if (def.args.length > 0) {
    lines.push("Arguments:");
    for (const arg of def.args) {
      const req = arg.required ? " (required)" : "";
      const dflt = arg.default ? ` [default: ${arg.default}]` : "";
      lines.push(`  ${arg.name}${req}${dflt}`);
      lines.push(`      ${arg.description}`);
    }
    lines.push("");
  }

  // Flags
  if (def.flags.length > 0) {
    lines.push("Flags:");
    for (const flag of def.flags) {
      const short = flag.short ? `-${flag.short}, ` : "    ";
      const val = flag.hasValue ? " <value>" : "";
      const dflt = flag.default ? ` [default: ${flag.default}]` : "";
      lines.push(`  ${short}--${flag.name}${val}${dflt}`);
      lines.push(`      ${flag.description}`);
    }
    lines.push("");
  }

  // Block
  if (def.hasBlock) {
    lines.push("Accepts block: { ... }");
    lines.push("");
  }

  // Examples
  if (def.examples.length > 0) {
    lines.push("Examples:");
    for (const ex of def.examples) {
      lines.push(`  ${ex}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format all components list for CLI
 */
export function formatComponentsList(): string {
  const lines: string[] = [];
  const categories: ComponentDef["category"][] = ["layout", "content", "style", "interactive"];

  for (const category of categories) {
    const components = getComponentsByCategory(category);
    if (components.length === 0) continue;

    lines.push(`${category.charAt(0).toUpperCase() + category.slice(1)} Components:`);
    for (const comp of components) {
      const name = `/${comp.name}`.padEnd(14);
      lines.push(`  ${name} ${comp.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
