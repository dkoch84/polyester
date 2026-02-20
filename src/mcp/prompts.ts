/**
 * MCP Prompts
 *
 * Prompt templates for generating and converting Polyester documents.
 */

export interface PromptResult {
  messages: Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
}

// ─── create_document ───────────────────────────────────────────

export function createDocument(type: string, description: string): PromptResult {
  const typeHints: Record<string, string> = {
    report: "Use /page A4, headings, /table for data, /code for technical content, /image for figures.",
    presentation: "Use /page --pageless, /hero for title slides, /pagebreak between sections, large headings, /columns for side-by-side content.",
    resume: "Use /page A4 --margin 1.5cm, /columns for layout, /inline and /icon for contact details, /tag for skills, /progress for proficiency, /divider between sections.",
    article: "Use /page A4, markdown headings and paragraphs, /quote for pullquotes, /image with captions, /code for examples.",
    documentation: "Use /page --pageless, /fold for collapsible sections, /code with --lines and --title, /table for reference data, /card for callouts.",
  };

  const hint = typeHints[type.toLowerCase()] || "Choose appropriate components for the document type.";

  return {
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Create a Polyester (.poly) document.

Document type: ${type}
Description: ${description}

Guidelines:
- Start with /page to set up the document
- Use Polyester /command syntax, not raw HTML
- Use Markdown for regular text content between commands
- ${hint}
- Use the list_components and get_component_help tools to look up component syntax if needed

Generate the complete .poly document source.`,
      },
    }],
  };
}

// ─── convert_to_polyester ──────────────────────────────────────

export function convertToPolyester(source: string, sourceFormat: string): PromptResult {
  return {
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Convert the following ${sourceFormat} document to Polyester (.poly) format.

Source document:
\`\`\`${sourceFormat}
${source}
\`\`\`

Conversion guidelines:
- Start with /page A4
- Replace HTML/LaTeX structural elements with Polyester commands
- Keep text content as Markdown between commands
- Use /columns, /grid for layouts
- Use /code for code blocks (with language and --lines if appropriate)
- Use /table for tables
- Use /hero for prominent header sections
- Use /card for boxed content
- Use /quote for blockquotes
- Use /image for images
- Use the list_components and get_component_help tools to look up component syntax if needed

Generate the complete .poly document source.`,
      },
    }],
  };
}
