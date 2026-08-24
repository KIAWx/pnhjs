// Deno + notebook-friendly helper
//import { html } from "https://deno.land/x/display/mod.ts";

/**
 * One entry of a Vega-Lite tooltip: which field to show and how to read it.
 *
 * This lives here rather than in the MX module: it describes how data is
 * *presented*, not what it is. The MX module knows nothing about Vega-Lite,
 * and it should stay that way — presentation may depend on the data model,
 * but not the other way round.
 */
export type TooltipEntry = {
  field: string;
  type: string;
};

/**
 * Builds a tooltip entry for one field.
 *
 * @param field Column name to show.
 * @param type Vega-Lite field type; `"quantitative"` for measured values.
 */
export function tooltipEntry(field: string, type: string = "quantitative"): TooltipEntry {
  return { field, type };
}

/**
 * Builds tooltip entries for several fields at once.
 *
 * Without `labels` the column names are shown as they are — for an MX result
 * that means the full `~`-joined datapoint strings. With `labels` each column
 * is looked up and its readable label used instead; a column the map does not
 * cover falls back to its own name, so no entry can end up `undefined`.
 *
 * @param fields Column names, e.g. the datapoint strings of an MX result.
 * @param labels Optional map from column name to a readable label.
 * @param type Vega-Lite field type applied to every entry.
 *
 * @example
 * ```ts
 * tooltipEntries(valueCols);                    // raw column names
 * tooltipEntries(valueCols, col2LegendLabel);   // readable labels
 * ```
 */
export function tooltipEntries(
  fields: readonly string[],
  labels?: Readonly<Record<string, string>>,
  type: string = "quantitative",
): TooltipEntry[] {
  return fields.map((field) => tooltipEntry(labels?.[field] ?? field, type));
}

/**
 * A Vega-Lite specification.
 *
 * Deliberately loose: the spec is passed straight to `JSON.stringify` and
 * interpreted in the browser, so nothing here would gain from a stricter type.
 */
export type VegaSpec = Record<string, unknown>;

/** A CSS length — a number is taken as pixels, a string is used as given. */
export type CssSize = number | string;

/** Options for {@linkcode vegaHtml}. */
export type VegaHtmlOptions = {
  /** Width of the frame. Default `1000`. */
  width?: CssSize;
  /** Height of the frame. Default `500`. */
  height?: CssSize;
  /** Upper bound for the height; without it the height is fixed. */
  maxHeight?: CssSize | null;
  /** CSS `overflow` of the frame. Default `"auto"`. */
  overflow?: string;
  /** Draw a hairline border around the frame. Default `false`. */
  border?: boolean;
  /** Show the Vega action menu. Default `false`. */
  actions?: boolean;
  /** Vega renderer. Default `"canvas"`. */
  renderer?: "canvas" | "svg";
};

/**
 * Renders a Vega-Lite specification as HTML for a Deno notebook.
 *
 * @param spec The Vega-Lite specification.
 * @param opts Frame size and rendering options.
 */
export function vegaHtml(spec: VegaSpec, opts: VegaHtmlOptions = {}) {
  const {
    width = 1000,
    height = 500,
    maxHeight,
    overflow = "auto",
    border = false,
    actions = false,
    renderer = "canvas",
  } = opts;

  const id = "vis-" + crypto.randomUUID();
  const toCssSize = (value: CssSize | null | undefined, fallback: string): string => {
    if (value === undefined || value === null) return fallback;
    return typeof value === "number" ? `${value}px` : String(value);
  };

  const widthCss = toCssSize(width, "1000px");
  const heightCss = toCssSize(height, "500px");
  const maxHeightCss =
    maxHeight === undefined || maxHeight === null
      ? "none"
      : toCssSize(maxHeight, "none");
  const borderCss = border ? "border:1px solid #dcdcdc;" : "";

  return Deno.jupyter.html`
    <div style="width:${widthCss};height:${heightCss};max-height:${maxHeightCss};overflow:${overflow};box-sizing:border-box;${borderCss}">
      <div id="${id}" style="width:100%;height:100%;touch-action:none;"></div>
    </div>
    <script type="module">
      import embed from "https://cdn.jsdelivr.net/npm/vega-embed@6/+esm";
      const spec = ${JSON.stringify(spec)};
      embed("#${id}", spec, { actions: ${actions}, renderer: "${renderer}" });
    </script>
  `;
}