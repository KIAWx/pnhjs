/**
 * Load SIR 3S MX as polars data frames.
 * 
 * Sandbox to learn JavaScript by using it in a SIR 3S context.
 * To use this module, access to SIR 3S models and a licensed SIR 3S version are necessary.
 *
 * This module represents a non-binding, arbitrary work in progress provided without any warranty.
 *
 * [SIR 3S Toolkit](https://3sconsult.github.io/sir3stoolkit/)
 * provides ways to load MX in Python as pandas data frames.
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
 * An SIR 3S MX result — all data frames of one calculation in one object.
 *
 * This is the primary entry point of the module. Instead of calling
 * {@linkcode getMxFilesFromDir}, {@linkcode readMx1}, {@linkcode readMx2} and
 * {@linkcode readMxs} one after another and keeping track of which data frame
 * belongs to which file, a single call reads a whole result directory:
 *
 * ```ts
 * const mxResult = await MxResult.fromDir("./WD/B1/V0/BZ1");
 * mxResult.mxs.head(5);
 * ```
 *
 * The instance holds one data frame per MX file:
 *
 * | Property | Source | Content |
 * |---|---|---|
 * | {@linkcode MxResult.mx1 \| mx1} | `.mx1` | Channel definitions, one row per channel |
 * | {@linkcode MxResult.mx2 \| mx2} | `.mx2` | Vector channel definitions, one row per vector channel |
 * | {@linkcode MxResult.mxs \| mxs} | `.mxs` | The data itself, one row per time step |
 *
 * ### Why `fromDir` instead of `new MxResult(dir)`
 *
 * Reading the files is asynchronous, and a JavaScript `constructor` cannot be
 * `async` — it must return the instance, not a promise of one. Constructing
 * first and loading afterwards would leave the object in a half-built state in
 * which every property access is a guess. The static factory avoids that: once
 * the `await` resolves, the instance is complete and all data frames are there.
 *
 * The `.xml` SirCalc file is located and its path kept in
 * {@linkcode MxResult.files \| files}, but not yet parsed.
 */
export class MxResult {
    /** The directory the result was read from. */
    readonly dir: string;
    /** Paths of the files this result was built from. */
    readonly files: MxFiles;
    /** Channel definitions — see {@linkcode readMx1}. */
    readonly mx1: DataFrame;
    /** Vector channel definitions — see {@linkcode readMx2}. */
    readonly mx2: DataFrame;
    /** The result data, one row per time step — see {@linkcode readMxs}. */
    readonly mxs: DataFrame;

    /**
     * Not called directly — use {@linkcode MxResult.fromDir} or
     * {@linkcode MxResult.fromFiles}, which do the reading.
     */
    private constructor(dir: string, files: MxFiles, mx1: DataFrame, mx2: DataFrame, mxs: DataFrame) {
        this.dir = dir;
        this.files = files;
        this.mx1 = mx1;
        this.mx2 = mx2;
        this.mxs = mxs;
    }

    /**
     * Reads a whole MX result directory and returns it as one object.
     *
     * @param dir Directory holding the `.xml`, `.mx1`, `.mx2` and `.mxs` files.
     *   Defaults to `Deno.cwd()`.
     *
     * @returns A fully loaded {@linkcode MxResult}.
     *
     * @throws `Error` when at least one of the four file types is missing —
     *   see {@linkcode getMxFilesFromDir}.
     *
     * @example
     * ```ts
     * const mxResult = await MxResult.fromDir("./WD/B1/V0/BZ1");
     * console.log(mxResult.mxs.shape);
     * ```
     */
    static async fromDir(dir: string = Deno.cwd()): Promise<MxResult> {
        return await MxResult.fromFiles(await getMxFilesFromDir(dir), dir);
    }

    /**
     * Builds a result from file paths that are already known — useful when the
     * files do not sit together in one directory, or when a specific variant
     * was picked instead of the one {@linkcode getMxFilesFromDir} selects.
     *
     * @param files Paths of the four MX files.
     * @param dir Value for {@linkcode MxResult.dir \| dir}. Defaults to the
     *   empty string, since the files need not share a directory.
     *
     * @returns A fully loaded {@linkcode MxResult}.
     */
    static async fromFiles(files: MxFiles, dir: string = ""): Promise<MxResult> {
        // MXS can only be decoded once the channel layout from MX1 is known,
        // so that one is sequential. MX2 is independent and reads alongside it.
        const mx1 = await readMx1(files.mx1);
        const [mx2, mxs] = await Promise.all([
            readMx2(files.mx2),
            readMxs(files.mxs, mx1),
        ]);
        return new MxResult(dir, files, mx1, mx2, mxs);
    }

    /**
     * The datapoint strings of all scalar channels — the column names of
     * {@linkcode MxResult.mxs \| mxs} without the derived `Timestamp` column.
     */
    get dpStrs(): string[] {
        return this.mxs.columns.filter((column) => column !== "Timestamp");
    }

    /**
     * The scalar channels as {@linkcode S3sDp} objects instead of `~`-joined
     * strings — {@linkcode S3sDp.fromString} applied to
     * {@linkcode MxResult.dpStrs \| dpStrs}.
     */
    dps(): S3sDp[] {
        return this.dpStrs.map((dpStr) => S3sDp.fromString(dpStr));
    }
}

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
 * Reads an XML file as text, honouring the encoding its declaration names.
 *
 * `Deno.readTextFile` always decodes as UTF-8. SIR 3S writes its XML as
 * `Windows-1252`, where a byte such as `0xE4` stands for `ä` but is not a valid
 * UTF-8 start byte — decoding as UTF-8 turns it into the replacement character
 * `U+FFFD`. Since object names end up in the datapoint strings and therefore in
 * the MXS column names, every umlaut would be destroyed before the XML parser
 * ever sees it.
 *
 * The declaration is read first because it is ASCII-compatible in every
 * encoding in play here; a byte-order mark takes precedence over it.
 *
 * @param filePath Path to the XML file.
 * @returns The file content, decoded with the encoding it declares. Falls back
 *   to UTF-8 when no declaration is present or the named encoding is unknown.
 */
async function readXmlText(filePath: string): Promise<string> {
    const bytes = await Deno.readFile(filePath);

    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        return new TextDecoder("utf-8").decode(bytes);
    }
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);

    const declaration = new TextDecoder("ascii").decode(bytes.subarray(0, 200));
    const encoding = declaration.match(/<\?xml[^>]*\bencoding\s*=\s*["']([\w-]+)["']/i)?.[1];
    if (!encoding) return new TextDecoder("utf-8").decode(bytes);

    try {
        return new TextDecoder(encoding).decode(bytes);
    } catch {
        console.warn(`Unknown encoding "${encoding}" in ${filePath} - falling back to UTF-8.`);
        return new TextDecoder("utf-8").decode(bytes);
    }
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
    const xmlText = await readXmlText(filePath);
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
            const bytesReadHeader = await readFull(mx2File, bufferHeader);
            if (bytesReadHeader === 0) break; // end of file, all records read
            if (bytesReadHeader !== 64) {
                console.warn(`Truncated header: read ${bytesReadHeader} bytes, expected 64 - break...`);
                break;
            }
            const recordHeader = unpackRecord(bufferHeader.slice(0, bytesReadHeader)) as Record<string, unknown>;
            recordHeader.NOfItems = Math.floor(
                (recordHeader.DataLength as number) / (recordHeader.DataTypeLength as number),
            );

            const dataLength = recordHeader.DataLength as number;
            const bufferContent = new Uint8Array(dataLength);
            const bytesReadContent = await readFull(mx2File, bufferContent);
            if (bytesReadContent !== dataLength) {
                console.warn(`Truncated content: read ${bytesReadContent} bytes, expected ${dataLength} - break...`);
                break;
            }
            const recordContent = bufferContent.slice(0, bytesReadContent);

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

/**
 * Reads until `buffer` is full, the file ends, or no further progress is made.
 *
 * `Deno.FsFile.read` is allowed to return fewer bytes than the buffer holds
 * even when the file has more to give — that is normal for large reads, and it
 * is not an error. A single `read` call is therefore not enough to obtain a
 * fixed-length record: MXS records in particular run into several megabytes,
 * where short reads are likely rather than exotic.
 *
 * @param file Open file to read from.
 * @param buffer Destination; its length is the number of bytes requested.
 * @returns Bytes actually read. `0` means the file ended before anything was
 *   read; any value between `1` and `buffer.length - 1` means the file ended
 *   mid-record, i.e. it is truncated.
 */
async function readFull(file: Deno.FsFile, buffer: Uint8Array): Promise<number> {
    let total = 0;
    while (total < buffer.length) {
        const bytesRead = await file.read(buffer.subarray(total));
        if (bytesRead === null || bytesRead === 0) break; // end of file
        total += bytesRead;
    }
    return total;
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
 * string (`OBJTYPE~NAME1~NAME2~NAME3~ATTRTYPE~OBJTYPE_PK`, empty names left
 * out) — see {@linkcode S3sDp}.
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
    const decoder = new TextDecoder("utf-8");

    // Every record has the same layout, so column name and byte range of each
    // channel are worked out once here rather than again for every time step.
    // Building the column name per record meant doing the same work thousands
    // of times over; it also kept the decoding loop entangled with the
    // datapoint format, which it has no business knowing about.
    const channels = mx1Records
        .filter((row) => !row.isVectorChannel)
        .map((row) => ({
            key: S3sDp.fromMx1Row(row).toString(),
            dataType: row.DATATYPE as string,
            offset: row.DATAOFFSET as number,
            length: row.DATALENGTH as number,
        }));

    const mxsFile = await Deno.open(filePath);
    try {
        while (true) {
            const bytesRead = await readFull(mxsFile, buffer);
            if (bytesRead === 0) break; // end of file, all records read
            if (bytesRead !== mxRecordLength) {
                throw new Error(`Truncated record: read ${bytesRead} bytes, expected ${mxRecordLength}.`);
            }
            const recordUnpacked = buffer.slice(0, bytesRead);
            const view = new DataView(recordUnpacked.buffer, recordUnpacked.byteOffset, recordUnpacked.byteLength);
            const record: Record<string, unknown> = {};

            for (const channel of channels) {
                if (channel.dataType === "CHAR") {
                    record[channel.key] = decoder.decode(
                        recordUnpacked.subarray(channel.offset, channel.offset + channel.length),
                    ).replace(/\0.*$/, "").replace(/\s+$/, "");
                } else if (channel.dataType === "INT4") {
                    record[channel.key] = view.getInt32(channel.offset, true);
                } else if (channel.dataType === "REAL") {
                    record[channel.key] = view.getFloat32(channel.offset, true);
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
        const timestampKey = S3sDp.fromMx1Row(timestampRow).toString();
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


/**
 * The fields of a datapoint, in the order they appear in its string form.
 *
 * Together with {@linkcode DP_SEPARATOR} and {@linkcode DP_NAME_FIELDS} this is
 * the *only* place the format is defined. Both directions derive from it, so
 * writing and parsing can no longer drift apart — previously the order lived
 * twice, once as a template literal and once as a set of array indices.
 *
 * Deliberately not exported: outside code should go through
 * {@linkcode S3sDp.fromString} and {@linkcode S3sDp.toString} rather than take
 * the format apart itself.
 */
const DP_FIELDS = ["OBJTYPE", "NAME1", "NAME2", "NAME3", "ATTRTYPE", "OBJTYPE_PK"] as const;

/** The name fields — the only ones that may be empty and are then left out. */
const DP_NAME_FIELDS = ["NAME1", "NAME2", "NAME3"] as const;

/** Separator between the fields of a datapoint string. */
const DP_SEPARATOR = "~";

/** Name of one field of an {@linkcode S3sDp}. */
export type S3sDpField = (typeof DP_FIELDS)[number];

/** The six fields that identify a datapoint. */
export type S3sDpFields = Readonly<Record<S3sDpField, string>>;

/**
 * Identity of an SIR 3S datapoint — one channel of a result.
 *
 * A datapoint is identified by six fields, and that identity has a canonical
 * string form in which the fields are joined by `~`:
 *
 * ```text
 * OBJTYPE~NAME1~NAME2~NAME3~ATTRTYPE~OBJTYPE_PK
 *
 * KNOT~V-FHW-191~PH~4794189121752237861            only NAME1
 * FWES~V-FHW-061~R-FHW-0612~TK~4958171736338468563 NAME1 and NAME2
 * ALLG~TIMESTAMP~5108484491127470798               no names at all
 * ```
 *
 * The object it belongs to comes before the attribute being measured, and
 * empty names are left out rather than leaving empty slots behind.
 *
 * This string form is what the columns of the MXS `DataFrame` are named after,
 * which is why both directions are needed constantly. Data and format live in
 * one place here: the class knows how to read the string form, how to write it,
 * and how to derive a datapoint from an MX1 row. Nothing outside needs to know
 * the field order or the separator.
 *
 * @example Round trip
 * ```ts
 * const dp = S3sDp.fromString("KNOT~V-FHW-191~PH~4794189121752237861");
 * dp.OBJTYPE;       // "KNOT"
 * dp.ATTRTYPE;      // "PH"
 * dp.label;         // "KNOT V-FHW-191 PH"
 * `${dp}`;          // the original string again
 * ```
 */
export class S3sDp {
    readonly OBJTYPE: string;
    readonly ATTRTYPE: string;
    readonly NAME1: string;
    readonly NAME2: string;
    readonly NAME3: string;
    readonly OBJTYPE_PK: string;

    constructor(fields: S3sDpFields) {
        this.OBJTYPE = fields.OBJTYPE;
        this.ATTRTYPE = fields.ATTRTYPE;
        this.NAME1 = fields.NAME1;
        this.NAME2 = fields.NAME2;
        this.NAME3 = fields.NAME3;
        this.OBJTYPE_PK = fields.OBJTYPE_PK;
    }

    /**
     * Builds a datapoint from a row of the MX1 channel definition `DataFrame`.
     *
     * @param mx1Row One record of the `DataFrame` returned by {@linkcode readMx1}.
     */
    static fromMx1Row(mx1Row: Record<string, unknown>): S3sDp {
        const fields = {} as Record<S3sDpField, string>;
        for (const field of DP_FIELDS) fields[field] = String(mx1Row[field] ?? "");
        return new S3sDp(fields);
    }

    /**
     * Parses the canonical string form.
     *
     * Since empty names are left out when writing, the number of parts varies,
     * and the fields cannot simply be read off by index. Three positions are
     * fixed instead: the object type leads, the key closes, and the attribute
     * sits just before the key. Whatever lies between object type and attribute
     * are the names, in order.
     *
     * This relies on names filling from the front — `NAME2` set while `NAME1`
     * is empty could not be told apart from `NAME1` alone. SIR 3S fills them in
     * order, so the round trip holds; a file that broke that rule would shift
     * the names forward.
     *
     * Missing parts become empty strings, so a shortened string never produces
     * `undefined` fields.
     *
     * @param dpStr Datapoint string, e.g. an MXS column name.
     */
    static fromString(dpStr: string): S3sDp {
        const parts = dpStr.split(DP_SEPARATOR);
        const namen = parts.slice(1, Math.max(1, parts.length - 2));
        return new S3sDp({
            OBJTYPE: parts[0] ?? "",
            NAME1: namen[0] ?? "",
            NAME2: namen[1] ?? "",
            NAME3: namen[2] ?? "",
            ATTRTYPE: parts.length > 2 ? parts[parts.length - 2] : "",
            OBJTYPE_PK: parts.length > 1 ? parts[parts.length - 1] : "",
        });
    }

    /**
     * The canonical string form — the name of the matching MXS column.
     *
     * Empty names are left out instead of leaving empty slots behind, so a
     * datapoint without names reads `ALLG~TIMESTAMP~5108484491127470798`
     * rather than `ALLG~TIMESTAMP~~~~5108484491127470798`. Object type,
     * attribute and key are always present and keep the form parseable.
     *
     * Because this is `toString`, a datapoint can be used directly in a
     * template literal or wherever a string is expected.
     */
    toString(): string {
        const namen = DP_NAME_FIELDS.map((field) => this[field]).filter((name) => name !== "");
        return [this.OBJTYPE, ...namen, this.ATTRTYPE, this.OBJTYPE_PK].join(DP_SEPARATOR);
    }

    /**
     * Short label for legends and tooltips, e.g. `"KNOT V-FHW-191 PH"`.
     *
     * Object type, then the names, then the attribute — what the value belongs
     * to comes before what is being measured, which is how one would name it
     * out loud. The technical key is left out.
     *
     * Empty name parts are dropped rather than left as gaps, so a datapoint
     * with only `NAME1` reads `"KNOT V-FHW-191 PH"` while one that also carries
     * `NAME2` reads `"FWES V-FHW-061 R-FHW-0612 TK"`.
     */
    get label(): string {
        return [this.OBJTYPE, this.NAME1, this.NAME2, this.NAME3, this.ATTRTYPE]
            .filter((part) => part !== "")
            .join(" ");
    }
}





