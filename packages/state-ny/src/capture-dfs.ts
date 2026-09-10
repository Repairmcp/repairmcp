import type { CaptureIo } from '@repairmcp/state-law';
import { parseDfsHtml } from './parse-dfs.js';
import type { NySection } from './schema.js';
import type { NyDfsSource } from './sources-dfs.js';

/** Six fetches at the io-wide pause; title, subject, and status cross-checked. */
export async function captureNyDfs(io: CaptureIo, sources: readonly NyDfsSource[]): Promise<{ sections: NySection[]; report: { warnings: string[] } }> {
  const sections: NySection[] = [];
  for (const source of sources) {
    const html = await io.fetchText(source.url, { rawName: `ny-dfs-${source.kind}-${source.number.replace(/[^0-9a-z]+/gi, '-')}.html` });
    const parsed = parseDfsHtml(html, { kind: source.kind, number: source.number });
    if (parsed.subject !== source.heading) {
      throw new Error(`${source.cite}: the page's subject reads "${parsed.subject}" but the manifest expects "${source.heading}" — reconcile after reading the page.`);
    }
    const status = parsed.withdrawnDate ? 'withdrawn' : 'current';
    if (status !== source.expectedStatus) {
      throw new Error(`${source.cite} is now ${status} on dfs.ny.gov (expected ${source.expectedStatus}) — read the page, update the manifest and the tool descriptions consciously.`);
    }
    sections.push({
      cite: source.cite,
      code: 'DFS Guidance',
      chapter: source.chapter,
      chapterTitle: source.chapter === 'OGC opinions' ? 'Office of General Counsel opinions (guidance, not law)' : 'Insurance circular letters (guidance, not law)',
      heading: parsed.subject,
      text: parsed.text,
      effectiveDate: parsed.issueDate,
      historyNote: parsed.withdrawnDate ? `Issued ${parsed.issueDate}; withdrawn effective ${parsed.withdrawnDate}` : `Issued ${parsed.issueDate}`,
      domain: 'insurance',
      sourceUrl: source.url,
      captureSource: 'dfs',
      dfsStatus: status,
      ...(parsed.withdrawnDate ? { dfsWithdrawnDate: parsed.withdrawnDate } : {}),
    });
  }
  return { sections, report: { warnings: [] } };
}
