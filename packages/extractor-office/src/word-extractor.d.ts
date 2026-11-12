declare module "word-extractor" {
  export interface ExtractedWordDocument {
    getBody(): string;
    getHeaders(options?: { includeFooters?: boolean }): string;
    getFooters(): string;
    getFootnotes(): string;
    getEndnotes(): string;
    getTextboxes(options?: { includeBody?: boolean }): string;
  }

  export default class WordExtractor {
    extract(source: string | Buffer | Uint8Array): Promise<ExtractedWordDocument>;
  }
}
