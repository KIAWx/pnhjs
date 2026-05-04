// Deno + notebook-friendly helper
import { html } from "https://deno.land/x/display/mod.ts";

export function vegaHtml(spec, opts = {}) {
  const {
    width = 1000,
    height = 500,
    actions = false,
    renderer = "canvas",
  } = opts;

  const id = "vis-" + crypto.randomUUID();

  return html`
    <div id="${id}" style="width:${width}px;height:${height}px;touch-action:none;"></div>
    <script type="module">
      import embed from "https://cdn.jsdelivr.net/npm/vega-embed@6/+esm";
      const spec = ${JSON.stringify(spec)};
      embed("#${id}", spec, { actions: ${actions}, renderer: "${renderer}" });
    </script>
  `;
}