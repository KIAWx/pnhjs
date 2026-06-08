# Vega-Lite Demo

```vega-lite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "description": "Simple line chart",
  "data": {
    "values": [
      {"x": 1, "y": 10},
      {"x": 2, "y": 20},
      {"x": 3, "y": 15},
      {"x": 4, "y": 30}
    ]
  },
  "mark": "line",
  "encoding": {
    "x": {"field": "x", "type": "quantitative"},
    "y": {"field": "y", "type": "quantitative"}
  }
}
```