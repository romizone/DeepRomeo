/**
 * Native Office exports for the three canvas kinds. Word from the document's
 * Markdown, Excel from the sheet's headers/rows, PowerPoint from the slides.
 * Server-side only (Buffers); the /api/export route is the sole consumer.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";
import type { Slide, SpreadsheetData } from "./types";

export const OFFICE_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

/** A title is user/model text; a filename has rules. */
export function safeFileName(title: string, ext: string): string {
  const base = (title || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "document"}.${ext}`;
}

// ---------------------------------------------------------------- Word ----

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

/** **bold**, *italic*, `code` become runs. Anything else is plain text. */
function inlineRuns(text: string, base: { italics?: boolean } = {}): TextRun[] {
  const runs: TextRun[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) runs.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    else if (tok.startsWith("`")) runs.push(new TextRun({ text: tok.slice(1, -1), font: "Courier New", ...base }));
    else runs.push(new TextRun({ text: tok.slice(1, -1), italics: true, ...base }));
    last = m.index + tok.length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), ...base }));
  return runs.length ? runs : [new TextRun({ text: "", ...base })];
}

function tableFromRows(rows: string[][]): Table {
  const width = Math.max(1, ...rows.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: Array.from({ length: width }, (_, c) => {
            const text = cells[c] ?? "";
            return new TableCell({
              shading: i === 0 ? { type: ShadingType.CLEAR, fill: "EEEEEE" } : undefined,
              children: [new Paragraph({ children: inlineRuns(text) })],
            });
          }),
        }),
    ),
  });
}

const SPECIAL_LINE = /^(#{1,6}\s|\s*[-*]\s|\s*\d+[.)]\s|```|\s*\||>)/;

export async function markdownToDocx(title: string, markdown: string): Promise<Buffer> {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const children: (Paragraph | Table)[] = [];
  let listInstance = 0;
  let inNumbered = false;
  let i = 0;

  if (title) {
    children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  }

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      for (const c of code.length ? code : [""]) {
        children.push(
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: "F3F3F3" },
            children: [new TextRun({ text: c || " ", font: "Courier New", size: 18 })],
          }),
        );
      }
      inNumbered = false;
      continue;
    }

    // table block
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const raw = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "");
        const cells = raw.split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length) children.push(tableFromRows(rows));
      inNumbered = false;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      children.push(
        new Paragraph({ children: inlineRuns(heading[2]), heading: HEADINGS[heading[1].length - 1] }),
      );
      inNumbered = false;
      i++;
      continue;
    }

    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const level = Math.min(2, Math.floor(bullet[1].replace(/\t/g, "  ").length / 2));
      children.push(new Paragraph({ children: inlineRuns(bullet[2]), bullet: { level } }));
      inNumbered = false;
      i++;
      continue;
    }

    const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      if (!inNumbered) {
        listInstance++;
        inNumbered = true;
      }
      const level = Math.min(2, Math.floor(numbered[1].replace(/\t/g, "  ").length / 2));
      children.push(
        new Paragraph({
          children: inlineRuns(numbered[2]),
          numbering: { reference: "numbers", level, instance: listInstance },
        }),
      );
      i++;
      continue;
    }

    inNumbered = false;

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      children.push(
        new Paragraph({ border: { bottom: { style: "single", size: 6, color: "BBBBBB", space: 1 } } }),
      );
      i++;
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      children.push(
        new Paragraph({ children: inlineRuns(quote[1], { italics: true }), indent: { left: 720 } }),
      );
      i++;
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // plain paragraph: merge consecutive ordinary lines
    const buf = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !SPECIAL_LINE.test(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    children.push(new Paragraph({ children: inlineRuns(buf.join(" ")), spacing: { after: 160 } }));
  }

  const doc = new Document({
    creator: "DeepRomeo",
    title,
    numbering: {
      config: [
        {
          reference: "numbers",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: children.length ? children : [new Paragraph("")] }],
  });
  return Packer.toBuffer(doc);
}

// --------------------------------------------------------------- Excel ----

const NUMERIC = /^-?\d{1,15}(\.\d+)?$/;

export async function sheetToXlsx(title: string, sheet: SpreadsheetData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DeepRomeo";
  // Sheet names: at most 31 chars, none of [ ] : * ? / \
  const name = (title || "Sheet").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });

  const headers = sheet.headers.length ? sheet.headers : ["Column 1"];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };

  for (const row of sheet.rows) {
    ws.addRow(
      headers.map((_, c) => {
        const v = row[c] ?? "";
        return NUMERIC.test(v.trim()) ? Number(v) : v;
      }),
    );
  }

  headers.forEach((h, c) => {
    const longest = Math.max(h.length, ...sheet.rows.map((r) => (r[c] ?? "").length));
    ws.getColumn(c + 1).width = Math.min(60, Math.max(8, longest + 2));
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------- PowerPoint ----
//
// npm audit flags image-size (a pptxgenjs dependency) for infinite-loop DoS in
// its ICNS/JXL/HEIF parsers, with no patched release upstream as of 2.0.2.
// pptxgenjs only invokes it from addImage(), to measure a picture being added
// to a slide. Nothing here adds images — text only — so that code is
// unreachable from any input this export accepts. Keep it that way: adding
// addImage() here would put user-supplied bytes in front of that parser.

export async function slidesToPptx(title: string, slides: Slide[]): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "DeepRomeo";
  pres.title = title;

  const cover = pres.addSlide();
  cover.background = { color: "1F2937" };
  cover.addText(title || "Presentation", {
    x: 0.6,
    y: 1.6,
    w: 8.8,
    h: 1.6,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
    align: "center",
    valign: "middle",
  });

  slides.forEach((slide, idx) => {
    const s = pres.addSlide();
    s.addText(slide.title || `Slide ${idx + 1}`, {
      x: 0.5,
      y: 0.35,
      w: 9,
      h: 0.9,
      fontSize: 30,
      bold: true,
      color: "111827",
    });
    const bullets = (slide.bullets || []).filter((b) => String(b).trim());
    if (bullets.length) {
      s.addText(
        bullets.map((b) => ({ text: String(b), options: { bullet: true, breakLine: true } })),
        {
          x: 0.6,
          y: 1.4,
          w: 8.8,
          h: 3.6,
          fontSize: 20,
          color: "1F2937",
          valign: "top",
          paraSpaceAfter: 6,
        },
      );
    }
    if (slide.notes) s.addNotes(slide.notes);
    s.addText(`${idx + 1} / ${slides.length}`, {
      x: 8.6,
      y: 5.1,
      w: 1,
      h: 0.3,
      fontSize: 10,
      color: "9CA3AF",
      align: "right",
    });
  });

  const out = await pres.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
