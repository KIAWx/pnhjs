/**
 * Load SIR 3S MX as polars data frames.
 * 
 * Sandbox to learn JavaScript by using JavaScript in a SIR 3S context.
 * To use this package, access to SIR 3S models and a licensed SIR 3S version are necessary.
 *
 * This package represents a non-binding, arbitrary work in progress provided without any warranty.
 *
 * `SIR 3S Toolkit <https://3sconsult.github.io/sir3stoolkit/>`_
 * provides ways to load and process SIR 3S result data in Python - as pandas data frames - from SIR 3S's own MX format.
 *
 * @module
 */

import { XMLParser } from "fast-xml-parser";
import { pl, type DataFrame } from "nodejs-polars";

/** The files that make up an SIR 3S MX result. */
export type MxFiles = {
    /** .xml: SirCalc file (XML). */
    xml: string;
    /** .mx1: Channel definition file (XML). */
    mx1: string;
    /** .mx2: Vector channel definition file (binary). */
    mx2: string;
    /** .mxs: Data file (binary). */
    mxs: string;
};

/**
 * Scans a directory for the files that make up an SIR 3S MX result and
 * returns their paths as an {@linkcode MxFiles} object.
 *
 * Files are matched by extension and selected in **descending numeric order**,
 * so the lowest-numbered variant (e.g. `.1.mx1` over `.2.mx1`) wins.
 *
 * @param dir Directory to scan. Accepts an absolute path (returns absolute
 *   paths) or a relative path (returns relative paths). Defaults to
 *   `Deno.cwd()`.
 *
 * @returns Resolved {@linkcode MxFiles} with one path per file type.
 *
 * @throws `Error` listing every missing file type when at least one of
 *   `.xml`, `.mx1`, `.mx2`, or `.mxs` is not found in `dir`.
 *
 * @example
 * ```ts
 * const mxFiles = await getMxFilesFromDir("./WD/B1/V0/BZ1");
 * const mx1Df = await readMx1(mxFiles.mx1);
 * ```
 */
export async function getMxFilesFromDir(dir: string = Deno.cwd()): Promise<MxFiles> {
    const result: Partial<MxFiles> = {};
    const entries = [];
    for await (const entry of Deno.readDir(dir)) entries.push(entry);
    entries.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
    for (const entry of entries) {
        if (!entry.isFile) continue;
        const ext = entry.name.split(".").pop()?.toLowerCase();
        const path = `${dir}/${entry.name}`;
        if (ext === "xml") result.xml = path;
        else if (ext === "mx2") result.mx2 = path;
        else if (ext === "mx1") result.mx1 = path;
        else if (ext === "mxs") result.mxs = path;
    }
    if (!result.xml || !result.mx1 || !result.mx2 || !result.mxs) {
        throw new Error(`Missing files in "${dir}": ${(["xml", "mx1", "mx2", "mxs"] as const).filter(k => !result[k]).join(", ")}`);
    }
    return result as MxFiles;
}

/**
 * Reads an SIR 3S MX channel definition file `.mx1` (XML) and returns it as a Polars
 * `DataFrame`.
 *
 * Each row describes one MX channel. The function adds derived columns on top of
 * the raw XML attributes:
 *
 * | Column | Meaning |
 * |---|---|
 * | `NOfItems` | Number of values per record (`DATALENGTH / DATATYPELENGTH`) |
 * | `isVectorChannel` | Channel carries more than one value per record |
 * | `isVectorChannelMx2` | MX2 defined vector channel |
 * | `isVectorChannelMx2Rvec` | MX2 defined vector channel - `RVEC` data |
 *
 * @param filePath Path to the `.mx1` file (absolute or relative).
 * @returns `DataFrame` with one row per channel.
 */
export async function readMx1(filePath: string): Promise<DataFrame> {
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


/**
 * Reads an SIR 3S MX2 vector channel definition file (binary)
 * and returns it as a Polars `DataFrame`.
 *
 * An MX2 record essentially only defines, the order in
 * which the individual data items appear within the corresponding MX vector.
 *
 * Each row corresponds to a vector channel and contains:
 *
 * | Column | Meaning |
 * |---|---|
 * | `ObjType` | Object type (12-byte string) |
 * | `AttrType` | Attribute type (12-byte string) |
 * | `DataType` | Data type — `CHAR` or `INT4` |
 * | `DataTypeLength` | Byte size of one item |
 * | `DataLength` | Total byte size of the data block |
 * | `NOfItems` | Number of items (`DataLength / DataTypeLength`) |
 * | `Data` | Decoded values — `string[]` for `CHAR`, `number[]` for `INT4` |
 *
 * @param filePath Path to the `.mx2` file (absolute or relative).
 * @returns `DataFrame` with one row per vector channel definition.
 */
export async function readMx2(filePath: string): Promise<DataFrame> {
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

// '12s12s4si28xi'
export function unpackRecord(record: Uint8Array): { ObjType: string; AttrType: string; DataType: string; DataTypeLength: number; DataLength: number } {
    const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
    const decoder = new TextDecoder("utf-8");

    const ObjType = decoder.decode(record.subarray(0, 12)).replace(/\0.*$/, "").replace(/\s+$/, "");
    const AttrType = decoder.decode(record.subarray(12, 24)).replace(/\0.*$/, "").replace(/\s+$/, "");
    const DataType = decoder.decode(record.subarray(24, 28)).replace(/\0.*$/, "").replace(/\s+$/, "");

    const DataTypeLength = view.getInt32(28, true); // true = little-endian
    const DataLength = view.getInt32(60, true);

    return { ObjType, AttrType, DataType, DataTypeLength, DataLength };
}

/**
 * Reads an SIR 3S MXS data file (binary) and returns it as
 * a Polars `DataFrame`.
 *
 * The MXS file contains one fixed-length MX record per time step. The record
 * layout is described by the MX1 channel definition `DataFrame` (`mx1Df`),
 * which must be passed in so the function knows the offset, length, and data
 * type of every channel. 
 * 
 * Vector channels (`isVectorChannel === true`) are skipped for now.
 *
 * Each column in the returned `DataFrame` is named by the channel's datapoint
 * string (`OBJTYPE~ATTRTYPE~NAME1~NAME2~NAME3~OBJTYPE_PK`).
 * If a `TIMESTAMP` channel is present it is additionally parsed into a
 * `Datetime("ms")` column named `Timestamp`.
 *
 * @param filePath Path to the `.mxs` file (absolute or relative).
 * @param mx1Df Channel definition `DataFrame` returned by {@linkcode readMx1}.
 * @returns `DataFrame` with one row per time step and one column per channel.
 * @throws `Error` if a record in the file has an unexpected byte length.
 */
export async function readMxs(filePath: string, mx1Df: DataFrame): Promise<DataFrame> {
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
                throw new Error(`Unexpected record size: read ${bytesRead} bytes, expected ${mxRecordLength}.`);
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
                .str.strptime(pl.Datetime, "%Y-%m-%d %H:%M:%S%.6f%:z")
                .alias("Timestamp"),
        );
        df = df.withColumns(
            pl.col("Timestamp").cast(pl.Datetime("ms")),
        );
    }

    return df;
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




