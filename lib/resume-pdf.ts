import PDFDocument from "pdfkit";
import path from "node:path";

export async function renderResumePdf(resume: string): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margins: { top: 32, bottom: 32, left: 42, right: 42 }, info: { Title: "Resume" } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { document.on("data", (chunk: Buffer) => chunks.push(chunk)); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  const fonts = path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files");
  document.registerFont("regular", path.join(fonts, "noto-sans-latin-400-normal.woff"));
  document.registerFont("bold", path.join(fonts, "noto-sans-latin-700-normal.woff"));
  // Word's private-use bullets and non-breaking hyphens do not exist in the font.
  // Normalize them before layout so they remain visible and searchable in PDFs.
  const normalized = resume.normalize("NFKC").replace(/[\uF0B7\uF0A7\uF0D8\u2023\u25AA\u25CF\u0000]/g, "•").replace(/[\u2010-\u2015\u2212]/g, "-");
  const section = /^(?:professional\s+)?(?:profile|summary|technical skills|skills|experience|work experience|employment|projects|open source|education|certifications|achievements|publications|languages)\s*:?[\s]*$/i;
  const lines: string[] = [];
  let reachedBody = false;
  for (const raw of normalized.split(/\r?\n/)) {
    const line = raw.trim();
    const previous = lines[lines.length - 1];
    if (section.test(line)) reachedBody = true;
    // CV extraction often inserts hard line breaks mid-sentence. Join those
    // without combining headings, bullets, or deliberately separated blocks.
    if (reachedBody && line && previous && previous.length > 70 && !/[.!?:]$/.test(previous) && !section.test(line) && !/^(?:[•*]|-\s)\s*/.test(line)) lines[lines.length - 1] += ` ${line}`;
    else lines.push(line);
  }
  let inHeader = true;
  let headerLines = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (headerLines) { document.moveDown(0.22); inHeader = false; } continue; }
    if (section.test(line)) {
      inHeader = false;
      if (document.y > document.page.height - document.page.margins.bottom - 35) document.addPage();
      document.moveDown(0.35).font("bold").fontSize(9).fillColor("#194e40").text(line.replace(/:$/, "").toUpperCase(), { lineGap: 0 });
      const y = document.y + 1;
      document.save().strokeColor("#194e40").lineWidth(0.5).moveTo(document.page.margins.left, y).lineTo(document.page.width - document.page.margins.right, y).stroke().restore();
      document.y = y + 3;
      continue;
    }
    if (inHeader) {
      document.font(headerLines ? "regular" : "bold").fontSize(headerLines ? 8.5 : 16).fillColor(headerLines ? "#111111" : "#194e40").text(line, { align: "center", lineGap: 0 });
      headerLines++;
      if (headerLines >= 4) inHeader = false;
      continue;
    }
    const bullet = /^(?:[•*]|-\s)\s*/.test(line);
    document.font("regular").fontSize(8.7).fillColor("#111111");
    if (bullet) {
      const content = line.replace(/^(?:[•*]|-\s)\s*/, "");
      document.text(`•  ${content}`, { lineGap: 0.4, indent: 3, paragraphGap: 1 });
    } else document.text(line, { lineGap: 0.4, paragraphGap: 1 });
  }
  document.end();
  return done;
}
