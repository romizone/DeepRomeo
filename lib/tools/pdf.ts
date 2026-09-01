export interface PdfVerifyIssue {
  severity: "error" | "warning";
  message: string;
}

export interface PdfVerifyReport {
  ok: boolean;
  filename?: string;
  pages?: number;
  charCount: number;
  wordCount: number;
  excerpt: string;
  issues: PdfVerifyIssue[];
}

function pdfEscape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function toPdfText(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .split("")
    .map((ch) => (ch.charCodeAt(0) <= 255 ? ch : "?"))
    .join("");
}

function wrapLine(text: string, max = 90): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function markdownToPlain(md: string) {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

export function createPdfBuffer(title: string, body: string): Buffer {
  const plainTitle = toPdfText(title || "Document");
  const plainBody = toPdfText(markdownToPlain(body || ""));
  const bodyLines = plainBody.split("\n").flatMap((line) => wrapLine(line, 92));

  const pageW = 612;
  const pageH = 792;
  const left = 54;
  const top = 738;
  const lineH = 16;
  const bottom = 54;
  const titleGap = 28;
  const firstBody = Math.floor((top - titleGap - bottom) / lineH);
  const laterBody = Math.floor((top - bottom) / lineH);

  const pages: string[][] = [];
  let remaining = [...bodyLines];
  let first = true;
  while (first || remaining.length) {
    const budget = first ? firstBody : laterBody;
    const chunk = remaining.slice(0, budget);
    remaining = remaining.slice(budget);
    pages.push(chunk);
    first = false;
    if (!remaining.length && pages.length) break;
  }
  if (!pages.length) pages.push([]);

  const objects: string[] = [];
  const add = (content: string) => {
    objects.push(content);
    return objects.length;
  };

  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    const ops: string[] = ["BT", `${lineH} TL`];
    let y = top;
    if (i === 0) {
      ops.push(`/F2 18 Tf`);
      // Tm sets the text matrix absolutely; Td would offset from the previous line.
      ops.push(`1 0 0 1 ${left} ${y} Tm`);
      ops.push(`(${pdfEscape(plainTitle)}) Tj`);
      y -= titleGap;
    }
    ops.push(`/F1 11 Tf`);
    ops.push(`1 0 0 1 ${left} ${y} Tm`);
    for (const line of pages[i]) {
      ops.push(`(${pdfEscape(line)}) Tj`);
      ops.push("T*");
    }
    ops.push("ET");
    const stream = ops.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> >>`,
    );
    pageIds.push(pageId);
  }

  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const pagesId = add(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  for (const pageId of pageIds) {
    objects[pageId - 1] = objects[pageId - 1].replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`);
  }

  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export function verifyPdfText(text: string, opts?: { filename?: string; pages?: number }): PdfVerifyReport {
  const cleaned = (text || "").replace(/\u0000/g, "").trim();
  const issues: PdfVerifyIssue[] = [];
  const words = cleaned ? cleaned.split(/\s+/).filter(Boolean) : [];
  if (!cleaned) {
    issues.push({
      severity: "error",
      message: "No extractable text. The file may be image-only, scanned, or encrypted.",
    });
  } else {
    if (cleaned.length < 40) {
      issues.push({ severity: "warning", message: "Very little text was extracted." });
    }
    const replacement = (cleaned.match(/\uFFFD|\?/g) || []).length;
    if (replacement > cleaned.length * 0.12 && cleaned.length > 80) {
      issues.push({ severity: "warning", message: "Many unreadable characters. Encoding may be damaged." });
    }
    if (words.length > 20 && new Set(words).size < Math.max(6, words.length * 0.08)) {
      issues.push({ severity: "warning", message: "Text looks repetitive or garbled." });
    }
    if (!/[.!?…]/.test(cleaned) && cleaned.length > 200) {
      issues.push({ severity: "warning", message: "No sentence punctuation found. Structure may be incomplete." });
    }
  }
  if (opts?.pages === 0) {
    issues.push({ severity: "error", message: "PDF reports zero pages." });
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    filename: opts?.filename,
    pages: opts?.pages,
    charCount: cleaned.length,
    wordCount: words.length,
    excerpt: cleaned.slice(0, 500),
    issues,
  };
}

export async function verifyPdfBuffer(data: Uint8Array, filename?: string): Promise<PdfVerifyReport> {
  try {
    const { extractText } = await import("unpdf");
    const result = await extractText(data);
    const pages = Array.isArray(result.text) ? result.text.length : undefined;
    const text = Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
    return verifyPdfText(text, { filename, pages });
  } catch {
    return verifyPdfText("", { filename });
  }
}
