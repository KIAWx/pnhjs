// Deno + notebook-friendly helper
//import { html } from "https://deno.land/x/display/mod.ts";

export function vegaHtml(spec, opts = {}) {
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
  const toCssSize = (value, fallback) => {
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