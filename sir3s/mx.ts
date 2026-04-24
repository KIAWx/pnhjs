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