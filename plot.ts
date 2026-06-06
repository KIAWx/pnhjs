// Deno + notebook-friendly helper
//import { html } from "https://deno.land/x/display/mod.ts";

type CssSize = number | string;

interface VegaHtmlOptions {
  width?: CssSize;
  height?: CssSize;
  maxHeight?: CssSize;
  overflow?: string;
  border?: boolean;
  actions?: boolean;
  renderer?: string;
}

export function vegaHtml(
  spec: unknown,
  opts: VegaHtmlOptions = {},
): Deno.jupyter.Displayable {
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
  const toCssSize = (value: CssSize | undefined | null, fallback: string) => {
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
  const specJson = JSON.stringify(spec)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const html = `
    <div style="width:${widthCss};height:${heightCss};max-height:${maxHeightCss};overflow:${overflow};box-sizing:border-box;${borderCss}">
      <div id="${id}" style="width:100%;height:100%;touch-action:none;"></div>
    </div>
    <script type="module">
      import embed from "https://cdn.jsdelivr.net/npm/vega-embed@6/+esm";
      const spec = ${specJson};
      embed("#${id}", spec, { actions: ${JSON.stringify(actions)}, renderer: ${JSON.stringify(renderer)} });
    </script>
  `;

  return {
    [Deno.jupyter.$display]: () => ({
      "text/html": html,
    }),
  };
}