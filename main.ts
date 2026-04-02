
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

  console.log(df.filter(pl.col("OBJTYPE").isNull()).toString());

  console.log(df.filter(
  pl.col("OBJTYPE")
    .cast(pl.Utf8)
    .isNull()).toString() // cast fails to Utf8 for non-strings -> null
);

  df = df.withColumns(
  pl.when(
    pl.col('NOfItems').gt(1).or(
      pl.col('OBJTYPE_PK').str.lengths().lt(3).and(pl.col('OBJTYPE').cast(pl.Utf8).str.starts_with("ALLG"))
    )
  )
  .then(pl.lit(true))
  .otherwise(pl.lit(false))
  .alias('isVectorChannel')
);
console.log(df.toString());

//console.log(df.filter(pl.col('OBJTYPE').cast(pl.Utf8).eq("ALLG")).select(["OBJTYPE", "OBJTYPE_PK","NOfItems"]).toString());



}


// PS C:\Users\wolters> mkdir pnhjs


//     Verzeichnis: C:\Users\wolters


// Mode                 LastWriteTime         Length Name
// ----                 -------------         ------ ----
// d-----        29.03.2026     14:31                pnhjs


// PS C:\Users\wolters> cd .\pnhjs\
// PS C:\Users\wolters\pnhjs> deno init
// ✅ Project initialized

// Run these commands to get started

//   # Run the program
//   deno run main.ts

//   # Run the program and watch for file changes
//   deno task dev

//   # Run the tests
//   deno test
// PS C:\Users\wolters\pnhjs> dir


//     Verzeichnis: C:\Users\wolters\pnhjs


// Mode                 LastWriteTime         Length Name
// ----                 -------------         ------ ----
// -a----        29.03.2026     14:31            118 deno.json
// -a----        29.03.2026     14:31            226 main.ts
// -a----        29.03.2026     14:31            143 main_test.ts


// PS C:\Users\wolters\pnhjs> git init
// Initialized empty Git repository in C:/Users/wolters/pnhjs/.git/
// PS C:\Users\wolters\pnhjs> git remote add origin https://github.com/KIAWx/pnhjs.git
// PS C:\Users\wolters\pnhjs> git add .
// warning: in the working copy of 'deno.json', LF will be replaced by CRLF the next time Git touches it
// warning: in the working copy of 'main.ts', LF will be replaced by CRLF the next time Git touches it
// warning: in the working copy of 'main_test.ts', LF will be replaced by CRLF the next time Git touches it
// PS C:\Users\wolters\pnhjs> git commit -m "Initial commit"
// [master (root-commit) 977a4c7] Initial commit
//  3 files changed, 22 insertions(+)
//  create mode 100644 deno.json
//  create mode 100644 main.ts
//  create mode 100644 main_test.ts
// PS C:\Users\wolters\pnhjs> git branch -M main
// PS C:\Users\wolters\pnhjs> git push -u origin main
// remote: Permission to KIAWx/pnhjs.git denied to aw3s.
// fatal: unable to access 'https://github.com/KIAWx/pnhjs.git/': The requested URL returned error: 403
// PS C:\Users\wolters\pnhjs> git remote set-url origin https://KIAWx@github.com/KIAWx/pnhjs.git
// PS C:\Users\wolters\pnhjs> git push -u origin main
// git: 'credential-nothing' is not a git command. See 'git --help'.
// Enumerating objects: 5, done.
// Counting objects: 100% (5/5), done.
// Delta compression using up to 12 threads
// Compressing objects: 100% (5/5), done.
// Writing objects: 100% (5/5), 659 bytes | 109.00 KiB/s, done.
// Total 5 (delta 0), reused 0 (delta 0), pack-reused 0
// To https://github.com/KIAWx/pnhjs.git
//  * [new branch]      main -> main
// branch 'main' set up to track 'origin/main'.
// PS C:\Users\wolters\pnhjs> net use /persistent:no M: \\NAS1\AM NASPython3# /user:WOL
// Der Befehl wurde erfolgreich ausgeführt.

// PS C:\Users\wolters\pnhjs>

