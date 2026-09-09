/**
 * The one place word-extractor is loaded. Kept out of the barrel (like
 * capture-*) and imported dynamically so no bundle path can pull an OLE
 * document reader into a Worker — the Colorado pdf-text.ts pattern.
 *
 * flrules.org serves every rule's text only as a Word 97 composite document
 * (`application/msword`; verified 2026-09-09, no HTML text view exists).
 * word-extractor is pure JS over the OLE container and the Word binary
 * format; getBody() returns the main text with paragraph newlines, which
 * parse-fac.ts normalizes. A reader failure throws and fails the capture —
 * never a silent empty section.
 */
export async function extractDocText(bytes: Uint8Array): Promise<string> {
  const mod = (await import('word-extractor')) as unknown as {
    default: new () => { extract(input: Buffer): Promise<{ getBody(): string }> };
  };
  const extractor = new mod.default();
  const document = await extractor.extract(Buffer.from(bytes));
  return document.getBody();
}
