import { html } from "https://deno.land/x/display/mod.ts";

export function plot(
  x: number[],
  y: number[],
  opts: { type?: "line" | "point" | "bar"; title?: string } = {},
) {
  const id = "vis-" + crypto.randomUUID();

  const data = x.map((xi, i) => ({ x: xi, y: y[i] }));

  const spec = {
    title: opts.title ?? "",
    mark: opts.type ?? "line",
    data: { values: data },
    encoding: {
      x: { field: "x", type: "quantitative" },
      y: { field: "y", type: "quantitative" },
    },
  };

  return html`
    <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
    <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>

    <div id="${id}"></div>

    <script>
      vegaEmbed("#${id}", ${JSON.stringify(spec)});
    </script>
  `;
}