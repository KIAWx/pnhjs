
import { XMLParser } from "fast-xml-parser";
import pl from "nodejs-polars";

export function add(a: number, b: number): number {
  return a + b;
}

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  //console.log("Add x2 + 3 =", add(2, 3));
  // dummy read of xml file ccc
  //


  const xmlText = await Deno.readTextFile("M-1-0-1.1.MX1");
  console.log(Object.prototype.toString.call(xmlText));
  //const xmlText = await Deno.readTextFile("M-1-0-1.XML");

  //console.log(xmlText);

  // docs/v4, v5/2.XMLparseOptions.md
  // https://github.com/NaturalIntelligence/fast-xml-parser/blob/0c0a7dc500983c549c2b1c9e1987dfabc69eddda/docs/v4%2C%20v5/2.XMLparseOptions.md
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",//@@_",
    parseAttributeValue: true,
    trimValues: true
  }
  );
  //
  const jsonObj = parser.parse(xmlText);
  console.log(Object.prototype.toString.call(jsonObj));

  console.log(jsonObj);

  let items = jsonObj.DocumentElement.XL1;
  // Ensure it's an array
  if (!Array.isArray(items)) {
    items = [items];
    console.log('####dddddddddddddddddddddddddddddddddxxxxxxxxxxxxxxxxxx');
    console.warn(items);
  }
  else {

  console.log('####ddddddddddddddddddddddddddddddddd');
  console.warn(items);
  }
  //
  //const data = {'a': [1n, 2n], 'b': [3, 4]};
  //const df = pl.DataFrame(data);
  //console.log(df.toString());

  console.log(Object.prototype.toString.call(items));
  let df = pl.DataFrame(items) //pl.readJSON(json);
  //
  console.log(df.toString());

  // Assuming self.mx1Df is your Polars DataFrame
  df = df.withColumns(
    pl.col('DATALENGTH').div(pl.col('DATATYPELENGTH'))
    .cast(pl.Int64)
    .alias('NOfItems')
  );
  console.log(df.toString());

  console.log(df.schema);

  df = df.withColumns(
  pl.when(
    pl.col('NOfItems').gt(1).or(
      pl.col('OBJTYPE_PK').str.lengths().lt(3).and(pl.col('OBJTYPE').str.startsWith("ALLG"))
    )
  )
  .then(pl.lit(true))
  .otherwise(pl.lit(false))
  .alias('isVectorChannel')
);
console.log(df.toString());

console.log(df.filter(pl.col('OBJTYPE').str.startsWith("ALLG")).select(["OBJTYPE", "OBJTYPE_PK","NOfItems"]).toString());



}
