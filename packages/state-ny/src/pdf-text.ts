/**
 * The one place unpdf is loaded. Kept out of the barrel (like capture-*), and
 * imported dynamically so no bundle path can pull a PDF library into a Worker.
 * Both PDF captures — the DOI bulletin and every CCR series document — come
 * through here.
 *
 * `extractText(pdf, { mergePages: false })` really does return `text` as a
 * string ARRAY, one entry per page, and with `mergePages: true` really does
 * return a single string. Verified against unpdf on the real 131-page
 * 3 CCR 702-5 document and the 2-page B-5.04 bulletin, because the deferred
 * question from the earlier review was whether the declared shape matched the
 * runtime one. It does; the defensive Array.isArray check stays anyway, since
 * the cost is one branch and the failure mode is a corpus of "[object Object]".
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text.map((page) => String(page)) : [String(text)];
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : String(text);
}
