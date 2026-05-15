import { ParserType, SourceType } from "@prisma/client";

export function parserTypeForSource(sourceType: SourceType) {
  switch (sourceType) {
    case SourceType.URL:
      return ParserType.HTML;
    case SourceType.ICS:
      return ParserType.ICS;
    case SourceType.PDF_UPLOAD:
      return ParserType.PDF_TEXT;
    case SourceType.GOOGLE_CALENDAR:
      return ParserType.GOOGLE;
    case SourceType.OUTLOOK_CALENDAR:
      return ParserType.OUTLOOK;
    default:
      return ParserType.UNKNOWN;
  }
}

export function labelSourceType(sourceType: SourceType) {
  return sourceType.replaceAll("_", " ").toLowerCase();
}
