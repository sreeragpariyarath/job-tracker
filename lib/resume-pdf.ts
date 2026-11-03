import PDFDocument from "pdfkit";
import path from "node:path";

export async function renderResumePdf(resume: string): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Resume" } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { document.on("data", (chunk: Buffer) => chunks.push(chunk)); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  const font = path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff");
  document.font(font).fontSize(10).text(resume, { lineGap: 3 });
  document.end();
  return done;
}
