import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { unzipSync } from "fflate";
import Papa from "papaparse";
import { XMLValidator } from "fast-xml-parser";
import { MAX_FILE_SIZE } from "./model";
export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function validateFile(
  name: string,
  bytes: Uint8Array,
): Promise<string> {
  if (!bytes.length)
    throw new UploadError("This file is empty. Choose a file with content.");
  if (bytes.length > MAX_FILE_SIZE)
    throw new UploadError(
      "This file is larger than 25 MB. Split it or export a smaller copy.",
      413,
    );
  const extension = name.split(".").pop()?.toLowerCase();
  if (
    !["pdf", "xlsx", "csv", "jpg", "jpeg", "png", "webp"].includes(
      extension || "",
    )
  )
    throw new UploadError(
      "Choose a PDF, XLSX, CSV, JPG, PNG, or WebP file. For HEIC photos, export a JPG copy.",
    );
  if (["jpg", "jpeg", "png", "webp"].includes(extension!)) {
    try {
      const image = sharp(bytes, {
        failOn: "warning",
        limitInputPixels: 40_000_000,
      });
      const metadata = await image.metadata();
      const expected = extension === "jpg" ? "jpeg" : extension;
      if (metadata.format !== expected || (metadata.pages || 1) > 1)
        throw new Error("Unsupported image");
      // Decode to validate content; keep the original uploaded bytes unchanged.
      await image.resize(1, 1).raw().toBuffer();
      return `image/${expected}`;
    } catch {
      throw new UploadError(
        "This picture is damaged, animated, too large to process, or does not match its filename. Export a still JPG, PNG, or WebP image under 40 megapixels and try again.",
      );
    }
  }
  if (extension === "pdf") {
    if (Buffer.from(bytes.slice(0, 5)).toString() !== "%PDF-")
      throw new UploadError(
        "This does not appear to be a PDF. Export a new PDF and try again.",
      );
    try {
      const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true });
      if (pdf.isEncrypted || pdf.getPageCount() < 1)
        throw new Error("Encrypted or empty");
    } catch {
      throw new UploadError(
        "This PDF is damaged, empty, or password-protected. Open it locally and export an unlocked PDF.",
      );
    }
    return "application/pdf";
  }
  if (extension === "xlsx") {
    try {
      let expanded = 0;
      let count = 0;
      const files = unzipSync(bytes, {
        filter(entry) {
          expanded += entry.originalSize;
          count++;
          if (expanded > 100 * 1024 * 1024 || count > 10000)
            throw new Error("Archive exceeds safety limit");
          if (/vbaProject|externalLinks/i.test(entry.name))
            throw new Error("Macros and external links unsupported");
          return true;
        },
      });
      if (
        !files["[Content_Types].xml"] ||
        !files["xl/workbook.xml"] ||
        !Object.keys(files).some((k) =>
          /^xl\/worksheets\/sheet\d+\.xml$/.test(k),
        )
      )
        throw new Error("Invalid workbook");
      for (const [name, content] of Object.entries(files)) {
        if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
        const xml = new TextDecoder("utf-8", { fatal: true }).decode(content);
        if (
          /<!DOCTYPE|<!ENTITY/i.test(xml) ||
          XMLValidator.validate(xml) !== true
        )
          throw new Error("Invalid workbook XML");
        if (/sheetProtection|workbookProtection/.test(xml))
          throw new Error("Protected workbook");
      }
      if (
        !new TextDecoder()
          .decode(files["xl/workbook.xml"])
          .includes("<workbook")
      )
        throw new Error("Invalid workbook root");
    } catch {
      throw new UploadError(
        "This XLSX is damaged, protected, too complex, or contains macros/external links. Save a standard unlocked .xlsx copy and try again.",
      );
    }
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) throw new Error("Binary");
    const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (
      !result.data.length ||
      result.errors.length ||
      result.data[0].length < 2 ||
      result.data.some((row) => row.length !== result.data[0].length)
    )
      throw new Error("Invalid rows");
  } catch {
    throw new UploadError(
      "This CSV could not be read. Export UTF-8 CSV with a header, at least two columns, and consistent columns in every row.",
    );
  }
  return "text/csv; charset=utf-8";
}
