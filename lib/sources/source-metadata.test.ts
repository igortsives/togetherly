import { ParserType, SourceType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { labelSourceType, parserTypeForSource } from "./source-metadata";

describe("source metadata", () => {
  it("maps MVP source types to parser types", () => {
    expect(parserTypeForSource(SourceType.URL)).toBe(ParserType.HTML);
    expect(parserTypeForSource(SourceType.ICS)).toBe(ParserType.ICS);
    expect(parserTypeForSource(SourceType.PDF_UPLOAD)).toBe(ParserType.PDF_TEXT);
  });

  it("formats source type labels", () => {
    expect(labelSourceType(SourceType.PDF_UPLOAD)).toBe("pdf upload");
  });
});
