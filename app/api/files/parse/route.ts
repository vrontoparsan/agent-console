import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/xml",
  "application/xml",
];

const ALLOWED_EXTENSIONS = [
  "pdf", "docx", "doc", "txt", "md", "csv", "xlsx", "xls", "xml",
];

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDocx(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function parseXlsx(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (workbook.SheetNames.length > 1) {
      lines.push(`--- Sheet: ${sheetName} ---`);
    }
    const csv = XLSX.utils.sheet_to_csv(sheet);
    lines.push(csv);
  }

  return lines.join("\n");
}

async function parseFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = getExtension(filename);

  switch (ext) {
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "xlsx":
    case "xls":
    case "csv":
      return parseXlsx(buffer);
    case "txt":
    case "md":
    case "xml":
      return buffer.toString("utf-8");
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const results: { filename: string; content: string; error?: string }[] = [];

  for (const [, value] of formData.entries()) {
    if (!(value instanceof File)) continue;

    const file = value;
    const ext = getExtension(file.name);

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      results.push({
        filename: file.name,
        content: "",
        error: `Unsupported file type: .${ext}`,
      });
      continue;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const content = await parseFile(buffer, file.name);
      results.push({ filename: file.name, content });
    } catch (err) {
      results.push({
        filename: file.name,
        content: "",
        error: err instanceof Error ? err.message : "Parse error",
      });
    }
  }

  return NextResponse.json({ files: results });
}
