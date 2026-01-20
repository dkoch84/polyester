/**
 * Designer-Friendly Descriptions
 *
 * Maps technical component/flag names to plain-English descriptions
 * that designers coming from tools like Illustrator or Figma can understand.
 */

export interface FriendlyDescription {
  friendly: string;
  visualDescription?: string;
}

/**
 * Friendly component descriptions
 */
export const COMPONENT_DESCRIPTIONS: Record<string, FriendlyDescription> = {
  page: {
    friendly: "Set up your document's paper size and margins",
    visualDescription: "Controls the overall canvas, like setting up artboards in Illustrator",
  },
  columns: {
    friendly: "Split content into side-by-side columns",
    visualDescription: "Creates a newspaper or magazine-style multi-column layout",
  },
  grid: {
    friendly: "Arrange items in rows and columns",
    visualDescription: "Like a photo grid or card layout where items align in both directions",
  },
  region: {
    friendly: "Create a styled container with background and spacing",
    visualDescription: "A box with its own background color and padding, like a section divider",
  },
  center: {
    friendly: "Center content horizontally on the page",
    visualDescription: "Like using 'Align Center' in Illustrator",
  },
  vcenter: {
    friendly: "Center content both horizontally and vertically",
    visualDescription: "Perfect centering in both directions, great for hero sections",
  },
  frame: {
    friendly: "Add a border and optional rounded corners around content",
    visualDescription: "Like drawing a rectangle around your content with stroke",
  },
  text: {
    friendly: "Style a piece of text with color, size, and emphasis",
    visualDescription: "Apply character formatting like bold, italic, color, or size",
  },
  quote: {
    friendly: "Display a highlighted quotation",
    visualDescription: "A pull quote or blockquote that stands out from body text",
  },
  code: {
    friendly: "Display code with syntax highlighting",
    visualDescription: "Formatted code with colors and a monospace font",
  },
  table: {
    friendly: "Create a data table with rows and columns",
    visualDescription: "Like a spreadsheet or data grid",
  },
  list: {
    friendly: "Create a bulleted or numbered list",
    visualDescription: "A vertical list of items with bullets or numbers",
  },
  checkbox: {
    friendly: "Add a checkbox item",
    visualDescription: "A task item with a check box that can be checked or unchecked",
  },
  image: {
    friendly: "Insert an image",
    visualDescription: "Place a photo, illustration, or graphic",
  },
  hero: {
    friendly: "Create a large attention-grabbing section",
    visualDescription: "A big banner area, often with a gradient background",
  },
  card: {
    friendly: "Create a card with optional icon",
    visualDescription: "A contained box like a business card or feature tile",
  },
  button: {
    friendly: "Add a clickable button",
    visualDescription: "A rectangular button that looks clickable",
  },
  shape: {
    friendly: "Draw a basic shape",
    visualDescription: "A circle, square, or other geometric shape",
  },
  fold: {
    friendly: "Create content that can be shown or hidden",
    visualDescription: "Like a disclosure triangle - click to expand/collapse",
  },
  style: {
    friendly: "Add custom CSS styling",
    visualDescription: "Advanced: write your own styling rules",
  },
  toc: {
    friendly: "Generate a table of contents",
    visualDescription: "An automatic list of all your headings as links",
  },
  pagebreak: {
    friendly: "Start a new page (for PDF output)",
    visualDescription: "Force content after this to appear on a new page when printed",
  },
  spacer: {
    friendly: "Add empty vertical space",
    visualDescription: "Like pressing Enter a few times to add breathing room",
  },
  divider: {
    friendly: "Add a horizontal line separator",
    visualDescription: "A thin line to visually separate sections",
  },
  include: {
    friendly: "Insert content from another file",
    visualDescription: "Pull in content from a separate .poly file",
  },
};

/**
 * Friendly flag descriptions mapped by component and flag name
 */
export const FLAG_DESCRIPTIONS: Record<string, Record<string, FriendlyDescription>> = {
  page: {
    size: {
      friendly: "Paper size like letter, A4, or custom dimensions",
      visualDescription: "Sets the page dimensions like selecting a preset in InDesign",
    },
    margin: {
      friendly: "White space around the edges of your page",
      visualDescription: "Empty space between content and page edge, like page margins in Word",
    },
    landscape: {
      friendly: "Use horizontal (wide) orientation instead of vertical",
      visualDescription: "Rotates the page 90° so it's wider than tall",
    },
  },
  columns: {
    gap: {
      friendly: "Space between columns (like magazine gutters)",
      visualDescription: "The empty space separating each column, like gutters in InDesign",
    },
  },
  grid: {
    columns: {
      friendly: "How wide each column should be",
      visualDescription: "Column sizes like '1fr 2fr' means second column is twice as wide",
    },
    rows: {
      friendly: "How tall each row should be",
      visualDescription: "Row heights - 'auto' means fit to content",
    },
    gap: {
      friendly: "Space between all grid items",
      visualDescription: "Uniform spacing between all items in the grid",
    },
  },
  region: {
    bg: {
      friendly: "Background color or gradient",
      visualDescription: "Fill color of the container, like shape fill in Illustrator",
    },
    padding: {
      friendly: "Space between the edge and your content inside",
      visualDescription: "Internal breathing room, like text inset in InDesign",
    },
  },
  frame: {
    border: {
      friendly: "Border line style (thickness, type, color)",
      visualDescription: "The stroke around the frame, like '2px solid blue'",
    },
    radius: {
      friendly: "Corner roundness (0 = sharp, higher = rounder)",
      visualDescription: "Like corner radius on a rounded rectangle",
    },
    padding: {
      friendly: "Space between the border and content inside",
      visualDescription: "How much room between the frame edge and what's inside",
    },
  },
  text: {
    bold: {
      friendly: "Make text bold/heavy",
      visualDescription: "Like pressing Cmd+B for bold",
    },
    italic: {
      friendly: "Make text italic/slanted",
      visualDescription: "Like pressing Cmd+I for italic",
    },
    color: {
      friendly: "Text color (name or hex code)",
      visualDescription: "The fill color of the text itself",
    },
    size: {
      friendly: "How large the text appears",
      visualDescription: "Font size - larger values mean bigger text",
    },
    font: {
      friendly: "Font family to use",
      visualDescription: "The typeface, like 'Arial' or 'Georgia'",
    },
  },
  image: {
    width: {
      friendly: "How wide the image should be",
      visualDescription: "Width as pixels, percentage, or other units",
    },
    height: {
      friendly: "How tall the image should be",
      visualDescription: "Height as pixels, percentage, or other units",
    },
    caption: {
      friendly: "Text description shown below the image",
      visualDescription: "Like a figure caption in a textbook",
    },
    alt: {
      friendly: "Description for accessibility (screen readers)",
      visualDescription: "Text that describes the image for blind users",
    },
  },
  table: {
    header: {
      friendly: "Treat the first row as column headers",
      visualDescription: "Makes the top row bold and distinct",
    },
    striped: {
      friendly: "Alternate row background colors",
      visualDescription: "Zebra stripes for easier reading",
    },
    bordered: {
      friendly: "Add borders around all cells",
      visualDescription: "Grid lines between every cell",
    },
  },
  list: {
    marker: {
      friendly: "Symbol to use for bullets",
      visualDescription: "Custom bullet character like '→' or '✓'",
    },
    ordered: {
      friendly: "Use numbers instead of bullets",
      visualDescription: "1, 2, 3... instead of bullet points",
    },
  },
  code: {
    lines: {
      friendly: "Show line numbers on the left",
      visualDescription: "Numbered lines like in a code editor",
    },
    title: {
      friendly: "Label shown above the code block",
      visualDescription: "Like a filename or description header",
    },
  },
  hero: {
    bg: {
      friendly: "Background color or gradient",
      visualDescription: "The dramatic background - try 'gradient' for the signature purple-blue",
    },
    height: {
      friendly: "How tall the hero section should be",
      visualDescription: "'100vh' fills the whole screen",
    },
  },
  card: {
    icon: {
      friendly: "Icon to display (by name)",
      visualDescription: "A small graphic like 'rocket', 'star', or 'check'",
    },
  },
  button: {
    variant: {
      friendly: "Button style (primary, secondary, outline)",
      visualDescription: "Visual importance - primary is most prominent",
    },
  },
  shape: {
    size: {
      friendly: "Width and height of the shape",
      visualDescription: "Dimensions like '100px' for a 100-pixel shape",
    },
    fill: {
      friendly: "Fill color inside the shape",
      visualDescription: "Like fill color in Illustrator",
    },
    stroke: {
      friendly: "Outline color around the shape",
      visualDescription: "Like stroke color in Illustrator",
    },
  },
  fold: {
    open: {
      friendly: "Start with content visible (expanded)",
      visualDescription: "Show the hidden content by default",
    },
  },
  spacer: {
    height: {
      friendly: "How much vertical space to add",
      visualDescription: "The gap size, like '2rem' for about 32 pixels",
    },
  },
  divider: {
    color: {
      friendly: "Color of the divider line",
      visualDescription: "The line color",
    },
    thickness: {
      friendly: "How thick the line is",
      visualDescription: "Line weight, like '2px' for a thicker line",
    },
  },
};

/**
 * Get friendly description for a component
 */
export function getComponentDescription(name: string): FriendlyDescription | undefined {
  return COMPONENT_DESCRIPTIONS[name.toLowerCase()];
}

/**
 * Get friendly description for a flag
 */
export function getFlagDescription(componentName: string, flagName: string): FriendlyDescription | undefined {
  const componentFlags = FLAG_DESCRIPTIONS[componentName.toLowerCase()];
  if (!componentFlags) return undefined;
  return componentFlags[flagName.toLowerCase()];
}

/**
 * Common default value explanations
 * Maps unit-based defaults to human-readable explanations
 */
export const DEFAULT_VALUE_EXPLANATIONS: Record<string, string> = {
  "1rem": "about 16 pixels - one line of normal text",
  "1.5rem": "about 24 pixels - slightly more than one line",
  "2rem": "about 32 pixels - two lines of normal text",
  "0.5rem": "about 8 pixels - half a line of text",
  "0.25rem": "about 4 pixels - a small gap",
  "100%": "fills the full available width",
  "50%": "half the available width",
  "100vh": "fills the full screen height",
  "50vh": "half the screen height",
  "auto": "adjusts automatically to fit content",
  "1fr": "one equal share of available space",
  "2fr": "two equal shares (twice as much as 1fr)",
  "8px": "a small amount of space",
  "16px": "about one line of text height",
  "24px": "slightly more than one line",
  "32px": "about two lines of text height",
};

/**
 * Get explanation for a default value
 */
export function explainDefaultValue(value: string): string | undefined {
  // Direct match
  if (DEFAULT_VALUE_EXPLANATIONS[value]) {
    return DEFAULT_VALUE_EXPLANATIONS[value];
  }

  // Try to explain rem values dynamically
  const remMatch = value.match(/^([\d.]+)rem$/);
  if (remMatch) {
    const num = parseFloat(remMatch[1]);
    const px = Math.round(num * 16);
    return `about ${px} pixels`;
  }

  // Try to explain px values
  const pxMatch = value.match(/^(\d+)px$/);
  if (pxMatch) {
    const px = parseInt(pxMatch[1]);
    if (px < 8) return "a tiny amount of space";
    if (px < 16) return "a small amount of space";
    if (px < 32) return "a moderate amount of space";
    return "a larger amount of space";
  }

  return undefined;
}
