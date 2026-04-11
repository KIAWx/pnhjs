
// https://javascript.info/


import { XMLParser } from "fast-xml-parser";
import { pl } from "nodejs-polars";
// https://pola-rs.github.io/nodejs-polars/



export function add(a: number, b: number): number {
  return a + b;
}

// '12s12s4si28xi'
export function unpackRecord(record: Uint8Array) {
    const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
    const decoder = new TextDecoder("utf-8");

    const ObjType = decoder.decode(record.subarray(0, 12)).replace(/\0.*$/, "").replace(/\s+$/, "");
    const AttrType = decoder.decode(record.subarray(12, 24)).replace(/\0.*$/, "").replace(/\s+$/, "");
    const DataType = decoder.decode(record.subarray(24, 28)).replace(/\0.*$/, "").replace(/\s+$/, "");

    const DataTypeLength = view.getInt32(28, true); // true = little-endian
    const DataLength = view.getInt32(60, true);

    return { ObjType, AttrType, DataType, DataTypeLength, DataLength };
  }

// Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
if (import.meta.main) {
  //console.log("Add x2 + 3 =", add(2, 3));
  // dummy read of xml file ccc
  //


  // 👉 MX1-read
  const xmlText = await Deno.readTextFile("M-1-0-1.1.MX1");
  console.log(Object.prototype.toString.call(xmlText));
  
  // MX1-parse
  // docs/v4, v5/2.XMLparseOptions.md
  // https://github.com/NaturalIntelligence/fast-xml-parser/blob/0c0a7dc500983c549c2b1c9e1987dfabc69eddda/docs/v4%2C%20v5/2.XMLparseOptions.md
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",//@@_",
    parseAttributeValue: true,
    trimValues: true
  }
  );
  const jsonObj = parser.parse(xmlText);
  console.log(Object.prototype.toString.call(jsonObj));

  // 👉 MX1-DataFrame
  let items = jsonObj.DocumentElement.XL1;
  // Ensure it's an array
  if (!Array.isArray(items)) {
    items = [items];
  }

  // console.log(Object.prototype.toString.call(items));
  let df = pl.DataFrame(items) 
  console.log(df.toString());

  // 👉 MX1-DataFrame editing
  // -----------------------------------------------------------------------------------------------------
  df = df.withColumns(
    pl.col('DATALENGTH').div(pl.col('DATATYPELENGTH'))
    .cast(pl.Int64)
    .alias('NOfItems')
  );
  //console.log(df.toString());

  df = df.withColumns(
  pl.when(
    pl.col('NOfItems')
    .gt(1).or(
      pl.col('OBJTYPE_PK').str.lengths().lt(3)
      .and(pl.col('OBJTYPE').cast(pl.Utf8).str.contains("^ALLG"))
    )
  )
  .then(pl.lit(true))
  .otherwise(pl.lit(false))
  .alias('isVectorChannel')
  );
  //console.log(df.toString());
  
  df = df.withColumns(
    pl.when(
      pl.col('isVectorChannel')
        .and(pl.col('FLAGS').gtEq(4))
        .and(pl.col('FLAGS').cast(pl.Int64)
    .div(4)
    .floor()
    .modulo(2)
    .eq(1))
    )
    .then(pl.lit(true))
    .otherwise(pl.lit(false))
    .alias('isVectorChannelMx2')
  );
  /*
  console.log(df.filter(
  pl.col("isVectorChannelMx2")
  ).toString());
  */
  
  df = df.withColumns(
    pl.when(
      pl.col('isVectorChannelMx2')
        .and(pl.col('DATATYPE').cast(pl.Utf8).str.contains("^RVEC"))
    )
    .then(pl.lit(true))
    .otherwise(pl.lit(false))
    .alias('isVectorChannelMx2Rvec')
  );  
  /*
  console.log(df.filter(
  pl.col("isVectorChannelMx2Rvec")
  ).toString());
  */

  console.log(df.toString());

  // 👉 MX2 reading
  // -----------------------------------------------------------------------------------------------------
  
  const mx2File = await Deno.open("M-1-0-1.MX2");
  
  const mx2Ar = [];
  
  try {
    while (true) {

      // Header
      const bufferHeader = new Uint8Array(64); 
      const bytesReadHeader = await mx2File.read(bufferHeader);
      if (bytesReadHeader === null) break; // EOF
      if (bytesReadHeader !== 64) {
        console.warn("Header: bytesReadHeader !== 64?! - break...");
        break; 
      }      
      const recordHeaderUnpacked = bufferHeader.slice(0,bytesReadHeader);
      const recordHeader = unpackRecord(recordHeaderUnpacked);
      recordHeader.NOfItems = Math.floor(recordHeader.DataLength / recordHeader.DataTypeLength);

      console.log(recordHeader);

      // Data
      const bufferContent = new Uint8Array(recordHeader.DataLength); 
      const bytesReadContent = await mx2File.read(bufferContent);
      const recordContentUnpacked=bufferContent.slice(0,bytesReadContent);

      if (recordHeader.DataType === 'CHAR') {
        const decoder = new TextDecoder("utf-8");
        const items=[];
        for (let i = 0; i < recordHeader.NOfItems; i++) {        
          const start=i*recordHeader.DataTypeLength;
          const end=start+recordHeader.DataTypeLength;
          const item = decoder.decode(recordContentUnpacked.subarray(start, end)).replace(/\0.*$/, "").replace(/\s+$/, "");
          items.push(item);
          //console.log(`CHAR Item ${i}: ${item}`);
          //break;
        }
        recordHeader.Data=items
      }
      else if (recordHeader.DataType === 'INT4') {
        const view = new DataView(recordContentUnpacked.buffer, recordContentUnpacked.byteOffset, recordContentUnpacked.byteLength);
        const items=[];
        for (let i = 0; i < recordHeader.NOfItems; i++) {        
          const start=i*recordHeader.DataTypeLength;
          const item = view.getInt32(start, true); // true = little-endian
          items.push(item);
          //console.log(`INT4 Item ${i}: ${item}`);
          //break;
        }    
        recordHeader.Data=items    
      }
      else {
        console.warn(`DataType ${recordHeader.DataType} not yet supported - break...`);
        break;
      }
      mx2Ar.push(recordHeader);

      //const rowDf = pl.DataFrame([recordHeader]);

      

      //mx2Df = mx2Df.vstack(rowDf);

      // process record
      //console.log(record);
      // console.log(recordHeader);
      //break;
    }
  } finally {
    mx2File.close();
  }

  const mx2Df = pl.DataFrame(mx2Ar);
  console.log(mx2Df.toString());
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

