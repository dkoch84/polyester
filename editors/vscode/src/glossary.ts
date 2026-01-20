/**
 * Glossary of CSS/HTML terms with designer-friendly explanations
 *
 * Provides explanations for web concepts using analogies from
 * design tools like Adobe Illustrator, InDesign, and Figma.
 */

export interface GlossaryEntry {
  term: string;
  short: string;
  full: string;
  designerAnalogy?: string;
  example?: string;
}

/**
 * Size units used in CSS
 */
export const UNITS: Record<string, GlossaryEntry> = {
  px: {
    term: "Pixels",
    short: "Screen dots",
    full: "Pixels are the tiny dots that make up your screen. 16px is about one line of text at normal size.",
    designerAnalogy: "Like measuring in screen resolution. On most screens, 96 pixels = 1 inch.",
    example: "16px = typical body text, 24px = small heading, 48px = large heading",
  },
  rem: {
    term: "Root Em",
    short: "Text-size units",
    full: "Relative to the base text size (usually 16px). 1rem = base size, 2rem = double that.",
    designerAnalogy: "Think of it as 'text-size units'. Everything scales if the base size changes.",
    example: "1rem = ~16px, 1.5rem = ~24px, 2rem = ~32px",
  },
  em: {
    term: "Em",
    short: "Parent-relative size",
    full: "Relative to the parent element's text size. Useful for scaling with context.",
    designerAnalogy: "Like Illustrator's 'scale relative to parent'. 2em inside a 16px container = 32px.",
    example: "1em = same as parent, 0.5em = half parent size",
  },
  "%": {
    term: "Percent",
    short: "Fraction of container",
    full: "A percentage of the containing element. 50% = half the available space.",
    designerAnalogy: "Like constraining proportions. 50% width means half the container width.",
    example: "50% = half, 100% = full width, 25% = quarter",
  },
  vh: {
    term: "Viewport Height",
    short: "% of screen height",
    full: "Percentage of the browser window height. 100vh = full screen height.",
    designerAnalogy: "Like artboard-relative sizing. 100vh fills the visible window vertically.",
    example: "100vh = full screen height, 50vh = half screen",
  },
  vw: {
    term: "Viewport Width",
    short: "% of screen width",
    full: "Percentage of the browser window width. 100vw = full screen width.",
    designerAnalogy: "Like artboard-relative sizing. 100vw fills the visible window horizontally.",
    example: "100vw = full screen width, 50vw = half screen",
  },
  cm: {
    term: "Centimeters",
    short: "Real-world cm",
    full: "Physical centimeters. Best for print documents where you need exact measurements.",
    designerAnalogy: "Exactly like cm in InDesign. Perfect for print layouts.",
    example: "2.54cm = 1 inch, 21cm ≈ A4 width",
  },
  mm: {
    term: "Millimeters",
    short: "Real-world mm",
    full: "Physical millimeters. For precise print measurements.",
    designerAnalogy: "Exactly like mm in InDesign. 10mm = 1cm.",
    example: "10mm = 1cm, 25.4mm = 1 inch",
  },
  pt: {
    term: "Points",
    short: "Print points (1/72 inch)",
    full: "Traditional typographic points. 72 points = 1 inch.",
    designerAnalogy: "Exactly like point sizes in Illustrator and InDesign. Standard for type.",
    example: "12pt = typical body text, 72pt = 1 inch tall",
  },
  in: {
    term: "Inches",
    short: "Real-world inches",
    full: "Physical inches. For print documents with imperial measurements.",
    designerAnalogy: "Exactly like inches in design software.",
    example: "1in = 2.54cm = 72pt = 96px",
  },
};

/**
 * HTML element explanations (for /style blocks)
 */
export const HTML_ELEMENTS: Record<string, GlossaryEntry> = {
  h1: {
    term: "Heading 1",
    short: "Main title/headline",
    full: "The main title of the document or section. The biggest, most important heading.",
    designerAnalogy: "Like the masthead or main headline in a magazine layout.",
    example: "Page title, article headline, hero text",
  },
  h2: {
    term: "Heading 2",
    short: "Section title",
    full: "Second-level heading for major sections. Smaller than h1 but still prominent.",
    designerAnalogy: "Like section headers in a magazine or chapter titles.",
    example: "Section titles, major divisions of content",
  },
  h3: {
    term: "Heading 3",
    short: "Subsection title",
    full: "Third-level heading for subsections. Useful for breaking up content.",
    designerAnalogy: "Like subheads within a magazine article.",
    example: "Subsection headers, topic introductions",
  },
  h4: {
    term: "Heading 4",
    short: "Minor heading",
    full: "Fourth-level heading for minor sections or groupings.",
    designerAnalogy: "Like sidebar titles or callout headers.",
    example: "Minor groupings, sidebar headers",
  },
  h5: {
    term: "Heading 5",
    short: "Small heading",
    full: "Fifth-level heading, rarely used. For deeply nested content.",
    designerAnalogy: "Like fine print section headers.",
  },
  h6: {
    term: "Heading 6",
    short: "Smallest heading",
    full: "Sixth-level heading, the smallest. Very rarely needed.",
    designerAnalogy: "Like label text for small sections.",
  },
  p: {
    term: "Paragraph",
    short: "Regular body text",
    full: "Standard paragraph text. The default text element for body content.",
    designerAnalogy: "Like a text frame in InDesign set to body text.",
    example: "Article body, descriptions, regular content",
  },
  body: {
    term: "Body",
    short: "Entire document",
    full: "The entire document. Styles here affect everything unless overridden.",
    designerAnalogy: "Like the document defaults or master page in InDesign.",
    example: "Setting default fonts, colors, or spacing for the whole page",
  },
  div: {
    term: "Division",
    short: "Generic container",
    full: "A generic container element. Used for grouping and layout.",
    designerAnalogy: "Like a group in Illustrator or a frame in Figma.",
    example: "Wrapping related content, creating layout sections",
  },
  span: {
    term: "Span",
    short: "Inline text wrapper",
    full: "An inline wrapper for text. Doesn't create a new line.",
    designerAnalogy: "Like selecting text within a paragraph to apply different formatting.",
    example: "Highlighting a word, changing color of specific text",
  },
  a: {
    term: "Anchor (Link)",
    short: "Clickable link",
    full: "A hyperlink that users can click to navigate.",
    designerAnalogy: "Like a hyperlink button in an interactive PDF.",
    example: "Navigation links, external references",
  },
  ul: {
    term: "Unordered List",
    short: "Bullet list",
    full: "A bulleted list. Each item gets a bullet point.",
    designerAnalogy: "Like a bulleted list in InDesign or Word.",
    example: "Feature lists, navigation menus",
  },
  ol: {
    term: "Ordered List",
    short: "Numbered list",
    full: "A numbered list. Items are automatically numbered.",
    designerAnalogy: "Like a numbered list in InDesign or Word.",
    example: "Steps, rankings, sequences",
  },
  li: {
    term: "List Item",
    short: "Single list entry",
    full: "One item in a list (either bulleted or numbered).",
    designerAnalogy: "Like a single bullet point in a list.",
  },
  img: {
    term: "Image",
    short: "Picture/graphic",
    full: "An image element for displaying pictures, photos, or graphics.",
    designerAnalogy: "Like a placed image in InDesign or Illustrator.",
  },
  table: {
    term: "Table",
    short: "Data grid",
    full: "A table for displaying data in rows and columns.",
    designerAnalogy: "Like a table in InDesign or a spreadsheet.",
  },
  blockquote: {
    term: "Block Quote",
    short: "Highlighted quote",
    full: "A quoted block of text, typically indented and styled differently.",
    designerAnalogy: "Like a pull quote in a magazine layout.",
  },
  pre: {
    term: "Preformatted",
    short: "Fixed-width text",
    full: "Preformatted text that preserves spaces and uses a monospace font.",
    designerAnalogy: "Like using Courier or a typewriter font with exact spacing.",
    example: "Code blocks, ASCII art",
  },
  code: {
    term: "Code",
    short: "Inline code",
    full: "Inline code text, displayed in a monospace font.",
    designerAnalogy: "Like formatting text as 'code' with a tech/typewriter look.",
  },
};

/**
 * CSS property explanations
 */
export const CSS_PROPERTIES: Record<string, GlossaryEntry> = {
  margin: {
    term: "Margin",
    short: "Space outside",
    full: "Empty space around the outside of an element. Pushes other elements away.",
    designerAnalogy: "Like the outer spacing or 'offset path' around an object in Illustrator.",
    example: "margin: 20px = 20px space on all sides outside the element",
  },
  padding: {
    term: "Padding",
    short: "Space inside",
    full: "Empty space between the content and the border. Like internal cushioning.",
    designerAnalogy: "Like text inset in InDesign - space between the frame edge and the text.",
    example: "padding: 20px = 20px of space inside, between content and edge",
  },
  gap: {
    term: "Gap",
    short: "Space between items",
    full: "Space between items in a grid or column layout. Like gutters.",
    designerAnalogy: "Exactly like gutters in InDesign or Figma's auto-layout spacing.",
    example: "gap: 1rem = about 16px between each item",
  },
  "border-radius": {
    term: "Border Radius",
    short: "Corner roundness",
    full: "How rounded the corners are. 0 = sharp corners, higher = rounder.",
    designerAnalogy: "Like corner radius in Illustrator's rounded rectangle tool.",
    example: "8px = slightly rounded, 50% = fully round (circle if square)",
  },
  "font-size": {
    term: "Font Size",
    short: "Text size",
    full: "The size of the text. Can use px, rem, em, pt, or other units.",
    designerAnalogy: "Exactly like point size in InDesign or Illustrator's character panel.",
    example: "16px = typical body, 24px = subheading, 48px = headline",
  },
  "font-weight": {
    term: "Font Weight",
    short: "Text boldness",
    full: "How bold or light the text is. 400 = normal, 700 = bold.",
    designerAnalogy: "Like choosing Regular, Medium, Bold from a font family.",
    example: "400 = regular, 500 = medium, 600 = semibold, 700 = bold",
  },
  "line-height": {
    term: "Line Height",
    short: "Line spacing",
    full: "Vertical space between lines of text. 1.5 = 150% of font size.",
    designerAnalogy: "Like leading in InDesign or Illustrator.",
    example: "1 = tight, 1.5 = comfortable reading, 2 = double-spaced",
  },
  "letter-spacing": {
    term: "Letter Spacing",
    short: "Character spacing",
    full: "Space between individual letters. Positive = more space, negative = tighter.",
    designerAnalogy: "Exactly like tracking in InDesign or Illustrator.",
    example: "0.05em = slightly loose, -0.02em = slightly tight",
  },
  color: {
    term: "Color",
    short: "Text color",
    full: "The color of the text. Can use hex (#ff0000), named colors (red), or rgb.",
    designerAnalogy: "Like fill color for text in Illustrator.",
    example: "#333 = dark gray, #007bff = blue, red = named red",
  },
  "background-color": {
    term: "Background Color",
    short: "Fill color",
    full: "The background fill color of an element.",
    designerAnalogy: "Like the fill color of a shape in Illustrator or Figma.",
    example: "#f5f5f5 = light gray, white, transparent",
  },
  background: {
    term: "Background",
    short: "Background fill",
    full: "The background of an element. Can be a color, gradient, or image.",
    designerAnalogy: "Like fill in Illustrator - can be solid, gradient, or pattern.",
    example: "#fff = white, linear-gradient(to right, #a855f7, #3b82f6) = purple to blue",
  },
  border: {
    term: "Border",
    short: "Edge line",
    full: "A line around the element. Defined by width, style, and color.",
    designerAnalogy: "Like stroke in Illustrator - the outline around a shape.",
    example: "1px solid #ccc = thin gray line, 2px dashed red = dashed red line",
  },
  width: {
    term: "Width",
    short: "Horizontal size",
    full: "The horizontal size of an element.",
    designerAnalogy: "Like the W value in Illustrator's transform panel.",
    example: "100% = full container width, 200px = exactly 200 pixels",
  },
  height: {
    term: "Height",
    short: "Vertical size",
    full: "The vertical size of an element.",
    designerAnalogy: "Like the H value in Illustrator's transform panel.",
    example: "auto = fit content, 100vh = full screen height",
  },
  display: {
    term: "Display",
    short: "Layout mode",
    full: "How an element is displayed. Controls layout behavior.",
    designerAnalogy: "Like choosing between inline text and block elements.",
    example: "block = full width, flex = flexible layout, grid = grid layout",
  },
  "text-align": {
    term: "Text Align",
    short: "Horizontal alignment",
    full: "Horizontal alignment of text within its container.",
    designerAnalogy: "Like paragraph alignment in InDesign - left, center, right, justify.",
    example: "left, center, right, justify",
  },
  "text-transform": {
    term: "Text Transform",
    short: "Case change",
    full: "Change the case of text (uppercase, lowercase, capitalize).",
    designerAnalogy: "Like Change Case in InDesign.",
    example: "uppercase = ALL CAPS, capitalize = Title Case",
  },
  opacity: {
    term: "Opacity",
    short: "Transparency",
    full: "How transparent an element is. 1 = solid, 0 = invisible.",
    designerAnalogy: "Exactly like opacity in Illustrator or Photoshop layers.",
    example: "1 = 100% visible, 0.5 = 50% transparent, 0 = invisible",
  },
  "box-shadow": {
    term: "Box Shadow",
    short: "Drop shadow",
    full: "A shadow effect around the element.",
    designerAnalogy: "Like drop shadow in Illustrator or Photoshop.",
    example: "0 4px 6px rgba(0,0,0,0.1) = subtle drop shadow",
  },
  "text-shadow": {
    term: "Text Shadow",
    short: "Text shadow",
    full: "A shadow effect on text.",
    designerAnalogy: "Like drop shadow applied to text in Illustrator.",
  },
  transform: {
    term: "Transform",
    short: "Rotate/scale/move",
    full: "Transform the element - rotate, scale, translate (move), skew.",
    designerAnalogy: "Like the transform tools in Illustrator.",
    example: "rotate(45deg), scale(1.5), translateX(10px)",
  },
};

/**
 * Color format explanations
 */
export const COLOR_FORMATS: Record<string, GlossaryEntry> = {
  hex: {
    term: "Hex Color",
    short: "#RRGGBB format",
    full: "Colors written as # followed by 6 characters (or 3 for shorthand). Each pair is red, green, blue (0-255 as 00-ff).",
    designerAnalogy: "The same hex codes used in Illustrator, Photoshop, and Figma.",
    example: "#ff0000 = red, #00ff00 = green, #0000ff = blue, #000 = black, #fff = white",
  },
  rgb: {
    term: "RGB Color",
    short: "Red, Green, Blue",
    full: "Colors as rgb(red, green, blue) with values 0-255.",
    designerAnalogy: "Like RGB values in any design software's color picker.",
    example: "rgb(255, 0, 0) = red, rgb(0, 0, 0) = black",
  },
  rgba: {
    term: "RGBA Color",
    short: "RGB with transparency",
    full: "RGB color with alpha (transparency). Alpha is 0-1.",
    designerAnalogy: "RGB with an opacity/transparency value.",
    example: "rgba(0, 0, 0, 0.5) = 50% transparent black",
  },
  hsl: {
    term: "HSL Color",
    short: "Hue, Saturation, Lightness",
    full: "Colors as hsl(hue, saturation%, lightness%). Hue is 0-360 degrees.",
    designerAnalogy: "Like the HSB picker in Illustrator (but Lightness instead of Brightness).",
    example: "hsl(0, 100%, 50%) = red, hsl(120, 100%, 50%) = green",
  },
  named: {
    term: "Named Colors",
    short: "Color names",
    full: "Standard color names like 'red', 'blue', 'coral', 'tomato', etc.",
    designerAnalogy: "Like using swatch names instead of values.",
    example: "red, blue, green, coral, tomato, steelblue, papayawhip",
  },
};

/**
 * Get a unit explanation with context
 */
export function getUnitExplanation(unit: string, value?: string): GlossaryEntry | undefined {
  const entry = UNITS[unit.toLowerCase()];
  if (!entry) return undefined;

  // If a value is provided, add specific context
  if (value && entry.term === "Root Em") {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      return {
        ...entry,
        short: `~${Math.round(numValue * 16)}px`,
        full: `${entry.full} ${numValue}rem ≈ ${Math.round(numValue * 16)}px at default size.`,
      };
    }
  }

  return entry;
}

/**
 * Get HTML element explanation
 */
export function getElementExplanation(element: string): GlossaryEntry | undefined {
  return HTML_ELEMENTS[element.toLowerCase()];
}

/**
 * Get CSS property explanation
 */
export function getPropertyExplanation(property: string): GlossaryEntry | undefined {
  return CSS_PROPERTIES[property.toLowerCase()];
}

/**
 * Reference guide sections for the sidebar
 */
export interface ReferenceSection {
  title: string;
  icon: string;
  htmlFile: string; // filename in out/reference/
  entries: GlossaryEntry[];
}

/**
 * Category overview sections for component categories
 */
export interface CategorySection {
  title: string;
  category: "layout" | "content" | "style" | "interactive";
  htmlFile: string;
  description: string;
}

export const CATEGORY_SECTIONS: CategorySection[] = [
  {
    title: "Layout Components",
    category: "layout",
    htmlFile: "category-layout.html",
    description: "Structure and arrange your content with columns, grids, regions, and frames.",
  },
  {
    title: "Content Components",
    category: "content",
    htmlFile: "category-content.html",
    description: "Display text, code, images, tables, and lists.",
  },
  {
    title: "Style Components",
    category: "style",
    htmlFile: "category-style.html",
    description: "Visual elements like heroes, cards, buttons, and shapes.",
  },
  {
    title: "Interactive Components",
    category: "interactive",
    htmlFile: "category-interactive.html",
    description: "Elements with user interaction like collapsible sections and checkboxes.",
  },
];

export const REFERENCE_SECTIONS: ReferenceSection[] = [
  {
    title: "Size Units",
    icon: "symbol-ruler",
    htmlFile: "units.html",
    entries: [
      UNITS.px,
      UNITS.rem,
      UNITS.em,
      UNITS["%"],
      UNITS.vh,
      UNITS.vw,
      UNITS.cm,
      UNITS.mm,
      UNITS.pt,
    ],
  },
  {
    title: "Layout Basics",
    icon: "layout",
    htmlFile: "layout.html",
    entries: [
      CSS_PROPERTIES.margin,
      CSS_PROPERTIES.padding,
      CSS_PROPERTIES.gap,
      CSS_PROPERTIES["border-radius"],
      CSS_PROPERTIES.width,
      CSS_PROPERTIES.height,
    ],
  },
  {
    title: "HTML for Designers",
    icon: "symbol-class",
    htmlFile: "html-elements.html",
    entries: [
      HTML_ELEMENTS.h1,
      HTML_ELEMENTS.h2,
      HTML_ELEMENTS.h3,
      HTML_ELEMENTS.p,
      HTML_ELEMENTS.body,
      HTML_ELEMENTS.div,
      HTML_ELEMENTS.span,
    ],
  },
  {
    title: "Colors",
    icon: "symbol-color",
    htmlFile: "colors.html",
    entries: [
      COLOR_FORMATS.hex,
      COLOR_FORMATS.rgb,
      COLOR_FORMATS.rgba,
      COLOR_FORMATS.named,
    ],
  },
  {
    title: "Typography",
    icon: "text-size",
    htmlFile: "typography.html",
    entries: [
      CSS_PROPERTIES["font-size"],
      CSS_PROPERTIES["font-weight"],
      CSS_PROPERTIES["line-height"],
      CSS_PROPERTIES["letter-spacing"],
      CSS_PROPERTIES.color,
      CSS_PROPERTIES["text-align"],
    ],
  },
];
