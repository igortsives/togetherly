declare module "pdf-parse" {
  type PdfParseResult = {
    text?: string;
    numpages?: number;
  };

  type PdfParseFn = (
    data: Buffer | Uint8Array
  ) => Promise<PdfParseResult>;

  const pdfParse: PdfParseFn;
  export default pdfParse;
}
