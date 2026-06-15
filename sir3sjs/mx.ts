import { XMLParser } from "fast-xml-parser";
import { pl } from "nodejs-polars";
//import { unpackRecord } from "../sir3s/mx.ts";

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

export async function readMxs(filePath: string, mx1Df: Awaited<ReturnType<typeof readMx1>>) {
    const mx1Records = mx1Df.toRecords();
    const lastMx1 = mx1Records[mx1Records.length - 1];
    const mxRecordLength = (lastMx1.DATAOFFSET as number) + (lastMx1.DATALENGTH as number);
    const buffer = new Uint8Array(mxRecordLength);
    const records: Record<string, unknown>[] = [];

    const mxsFile = await Deno.open(filePath);
    try {
        while (true) {
            const bytesRead = await mxsFile.read(buffer);
            if (bytesRead === null) break;
            if (bytesRead !== mxRecordLength) {
                console.warn(`bytesRead (${bytesRead}) !== mxRecordLength (${mxRecordLength})?! - break...`);
                break;
            }
            const recordUnpacked = buffer.slice(0, bytesRead);
            const view = new DataView(recordUnpacked.buffer, recordUnpacked.byteOffset, recordUnpacked.byteLength);
            const decoder = new TextDecoder("utf-8");
            const record: Record<string, unknown> = {};

            for (const row of mx1Records) {
                if (row.isVectorChannel) continue;
                const key = makeDpStrFromMx1Row(row);
                if (row.DATATYPE === "CHAR") {
                    record[key] = decoder.decode(
                        recordUnpacked.subarray(row.DATAOFFSET as number, (row.DATAOFFSET as number) + (row.DATALENGTH as number)),
                    ).replace(/\0.*$/, "").replace(/\s+$/, "");
                } else if (row.DATATYPE === "INT4") {
                    record[key] = view.getInt32(row.DATAOFFSET as number, true);
                } else if (row.DATATYPE === "REAL") {
                    record[key] = view.getFloat32(row.DATAOFFSET as number, true);
                }
            }
            records.push(record);
        }
    } finally {
        mxsFile.close();
    }

    let df = pl.DataFrame(records);

    const timestampRow = mx1Records.find((r) => r.ATTRTYPE === "TIMESTAMP" && !r.isVectorChannel);
    if (timestampRow) {
        const timestampKey = makeDpStrFromMx1Row(timestampRow);
        df = df.withColumns(
            pl.col(timestampKey)
                .str.strptime(pl.Datetime, "%Y-%m-%d %H:%M:%S%.6f%:z", { strict: false })
                .alias("Timestamp"),
        );
        df = df.withColumns(
            pl.col("Timestamp").cast(pl.Datetime("ms")),
        );
    }

    return df;
}
