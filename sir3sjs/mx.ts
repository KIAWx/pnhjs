import { XMLParser } from "fast-xml-parser";
import { pl } from "nodejs-polars";
import { unpackRecord } from "../sir3s/mx.ts";

export type S3sDp = {
    OBJTYPE: string;
    OBJTYPE_PK: string;
    ATTRTYPE: string;
    NAME1: string;
    NAME2: string;
    NAME3: string;
};

export type ttEntry = {
    field: string;
    type: string;
};

export function makeDpStrFromMx1Row(mx1Row: Record<string, unknown>): string {
    return `${mx1Row.OBJTYPE}~${mx1Row.ATTRTYPE}~${mx1Row.NAME1}~${mx1Row.NAME2}~${mx1Row.NAME3}~${mx1Row.OBJTYPE_PK}`;
}

export function makeDpFromDpStr(dpStr: string): S3sDp {
    const dpAr = dpStr.split("~");
    return {
        OBJTYPE: dpAr[0],
        OBJTYPE_PK: dpAr[5],
        ATTRTYPE: dpAr[1],
        NAME1: dpAr[2],
        NAME2: dpAr[3],
        NAME3: dpAr[4],
    };
}

export function makettEntryFromDpStr(dpStr: string, col2LegendLabel: Record<string, string>): ttEntry {
    return {
        field: col2LegendLabel[dpStr],
        type: "quantitative",
    };
}

export function makettEntryRawFromDpStr(dpStr: string): ttEntry {
    return {
        field: dpStr,
        type: "quantitative",
    };
}

export async function readMx1(filePath: string) {
    const xmlText = await Deno.readTextFile(filePath);
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        parseAttributeValue: true,
        trimValues: true,
    });
    const jsonObj = parser.parse(xmlText);
    let items = jsonObj.DocumentElement.XL1;
    if (!Array.isArray(items)) {
        items = [items];
    }
    let df = pl.DataFrame(items);
    df = df.withColumns(
        pl.col("DATALENGTH").div(pl.col("DATATYPELENGTH"))
            .cast(pl.Int64)
            .alias("NOfItems"),
    );
    df = df.withColumns(
        pl.when(
            pl.col("NOfItems").gt(1).or(
                pl.col("OBJTYPE_PK").str.lengths().lt(3)
                    .and(pl.col("OBJTYPE").cast(pl.Utf8).str.contains("^ALLG")),
            ),
        )
            .then(pl.lit(true))
            .otherwise(pl.lit(false))
            .alias("isVectorChannel"),
    );
    df = df.withColumns(
        pl.when(
            pl.col("isVectorChannel")
                .and(pl.col("FLAGS").gtEq(4))
                .and(
                    pl.col("FLAGS").cast(pl.Int64).div(4).floor().modulo(2).eq(1),
                ),
        )
            .then(pl.lit(true))
            .otherwise(pl.lit(false))
            .alias("isVectorChannelMx2"),
    );
    df = df.withColumns(
        pl.when(
            pl.col("isVectorChannelMx2")
                .and(pl.col("DATATYPE").cast(pl.Utf8).str.contains("^RVEC")),
        )
            .then(pl.lit(true))
            .otherwise(pl.lit(false))
            .alias("isVectorChannelMx2Rvec"),
    );
    return df;
}

export async function readMx2(filePath: string) {
    const mx2File = await Deno.open(filePath);
    const mx2Ar: Array<Record<string, unknown>> = [];
    try {
        while (true) {
            const bufferHeader = new Uint8Array(64);
            const bytesReadHeader = await mx2File.read(bufferHeader);
            if (bytesReadHeader === null) break;
            if (bytesReadHeader !== 64) {
                console.warn("Header: bytesReadHeader !== 64?! - break...");
                break;
            }
            const recordHeader = unpackRecord(bufferHeader.slice(0, bytesReadHeader)) as Record<string, unknown>;
            recordHeader.NOfItems = Math.floor(
                (recordHeader.DataLength as number) / (recordHeader.DataTypeLength as number),
            );

            const bufferContent = new Uint8Array(recordHeader.DataLength as number);
            const bytesReadContent = await mx2File.read(bufferContent);
            const recordContent = bufferContent.slice(0, bytesReadContent ?? 0);

            if (recordHeader.DataType === "CHAR") {
                const decoder = new TextDecoder("utf-8");
                const items: string[] = [];
                for (let i = 0; i < (recordHeader.NOfItems as number); i++) {
                    const start = i * (recordHeader.DataTypeLength as number);
                    const end = start + (recordHeader.DataTypeLength as number);
                    items.push(
                        decoder.decode(recordContent.subarray(start, end))
                            .replace(/\0.*$/, "")
                            .replace(/\s+$/, ""),
                    );
                }
                recordHeader.Data = items;
            } else if (recordHeader.DataType === "INT4") {
                const view = new DataView(recordContent.buffer, recordContent.byteOffset, recordContent.byteLength);
                const items: number[] = [];
                for (let i = 0; i < (recordHeader.NOfItems as number); i++) {
                    items.push(view.getInt32(i * (recordHeader.DataTypeLength as number), true));
                }
                recordHeader.Data = items;
            } else {
                console.warn(`DataType ${recordHeader.DataType} not yet supported - break...`);
                break;
            }
            mx2Ar.push(recordHeader);
        }
    } finally {
        mx2File.close();
    }
    return pl.DataFrame(mx2Ar);
}
