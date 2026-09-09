/**
 * word-extractor ships no type declarations. This is the minimal surface
 * doc-text.ts uses; anything more is unverified.
 */
declare module 'word-extractor' {
  export interface WordDocument {
    getBody(): string;
  }
  export default class WordExtractor {
    extract(input: Buffer | string): Promise<WordDocument>;
  }
}
