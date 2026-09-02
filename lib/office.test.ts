import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { markdownToDocx, safeFileName, sheetToXlsx, slidesToPptx } from "./office.ts";

/**
 * Just enough of a zip reader to look inside an OOXML package: walk the
 * central directory, then pull each entry via its local header.
 */
function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.ok(eocd >= 0, "no end-of-central-directory record: not a zip");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    assert.equal(buf.readUInt32LE(off), 0x02014b50, "bad central directory entry");
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString("utf8");
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const dataStart = local + 30 + lNameLen + lExtraLen;
    const data = buf.subarray(dataStart, dataStart + csize);
    out.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

test("markdownToDocx produces a Word package carrying the document's text and structure", async () => {
  const md = [
    "# Laporan Kopdes",
    "",
    "Koperasi Desa adalah **motor** ekonomi warga.",
    "",
    "- Simpan pinjam",
    "- Usaha bersama",
    "",
    "1. Pertama",
    "2. Kedua",
    "",
    "| Pos | Nilai |",
    "|-----|-------|",
    "| MBG | 250 |",
  ].join("\n");
  const buf = await markdownToDocx("Kopdes dan MBG", md);
  assert.equal(buf.subarray(0, 2).toString(), "PK", "not a zip");
  const files = unzip(buf);
  assert.ok(files.has("[Content_Types].xml"), "missing [Content_Types].xml");
  const doc = files.get("word/document.xml")!.toString("utf8");
  for (const text of ["Kopdes dan MBG", "Laporan Kopdes", "motor", "Simpan pinjam", "Kedua", "MBG", "250"]) {
    assert.ok(doc.includes(text), `document.xml lacks "${text}"`);
  }
  assert.match(doc, /<w:tbl>/, "table was not emitted as a Word table");
  assert.match(doc, /w:pStyle w:val="Heading1"/, "heading lost its style");
  assert.match(doc, /<w:b\/>/, "bold run lost");
  assert.match(doc, /<w:numPr>/, "list lost its numbering");
});

test("sheetToXlsx round-trips through an independent reader with numbers as numbers", async () => {
  const buf = await sheetToXlsx("Anggaran Desa", {
    headers: ["Pos", "Nilai", "Catatan"],
    rows: [
      ["Kopdes", "100", "simpan pinjam"],
      ["MBG", "250.5", ""],
    ],
  });
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  assert.equal(ws.name, "Anggaran Desa");
  assert.equal(ws.getCell("A1").value, "Pos");
  assert.equal(ws.getCell("A1").font?.bold, true, "header should be bold");
  assert.equal(ws.getCell("B2").value, 100, "numeric text should become a number");
  assert.equal(ws.getCell("B3").value, 250.5);
  assert.equal(ws.getCell("C2").value, "simpan pinjam");
  assert.equal(ws.views[0]?.ySplit, 1, "header row should be frozen");
});

test("slidesToPptx produces a deck with a cover, one slide per entry, and notes", async () => {
  const buf = await slidesToPptx("Deck Kopdes", [
    { id: "s1", title: "Kopdes", bullets: ["Koperasi Desa", "Ekonomi warga"], notes: "Sebut angka anggota" },
    { id: "s2", title: "MBG", bullets: ["Makan Bergizi Gratis"] },
  ]);
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  const files = unzip(buf);
  const slideNames = [...files.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slideNames.length, 3, "cover + 2 slides");
  const all = slideNames.map((n) => files.get(n)!.toString("utf8")).join("\n");
  for (const text of ["Deck Kopdes", "Kopdes", "Koperasi Desa", "Ekonomi warga", "MBG", "Makan Bergizi Gratis"]) {
    assert.ok(all.includes(text), `slides lack "${text}"`);
  }
  const notes = [...files.keys()]
    .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
    .map((n) => files.get(n)!.toString("utf8"))
    .join("\n");
  assert.ok(notes.includes("Sebut angka anggota"), "speaker notes missing");
});

test("safeFileName strips what a filesystem rejects and never returns an empty name", () => {
  assert.equal(safeFileName('Laporan: Q1/Q2 "final"?', "docx"), "Laporan Q1 Q2 final.docx");
  assert.equal(safeFileName("", "xlsx"), "document.xlsx");
  assert.equal(safeFileName("   ", "pptx"), "document.pptx");
  assert.ok(safeFileName("x".repeat(200), "docx").length <= 85);
});
