import { load } from 'cheerio';
import {
  DEGInquirySchema,
  type DEGInquiry,
  type InformationProvider,
  type InquiryStatus,
  type LaborType,
} from './schema.js';

export const USER_AGENT = 'RepairMCP-Bot/1.0 (+https://repairmcp.org)';
export const BASE_URL = 'https://degweb.org';

const IP_KEYWORDS: Record<InformationProvider, RegExp[]> = {
  CCC: [/\bMOTOR\b/gi, /\bGTE Pages?\b/gi, /\bP-pages?\b/gi, /\bCCC\b/gi],
  Mitchell: [/\bMitchell DBRM\b/gi, /\bMitchell\b/gi, /\bMWS\b/gi],
  Audatex: [/\bAudatex\b/gi, /\bDBRM Section\b/gi, /\bSolera\b/gi, /\bQapter\b/gi],
};

export function classifyIP(text: string): InformationProvider | null {
  const scores: Record<InformationProvider, number> = { CCC: 0, Mitchell: 0, Audatex: 0 };
  for (const ip of Object.keys(IP_KEYWORDS) as InformationProvider[]) {
    for (const re of IP_KEYWORDS[ip]) {
      const matches = text.match(re);
      if (matches) scores[ip] += matches.length;
    }
  }
  const entries = Object.entries(scores) as Array<[InformationProvider, number]>;
  let best: InformationProvider | null = null;
  let bestScore = 0;
  let tied = false;
  for (const [ip, score] of entries) {
    if (score > bestScore) {
      best = ip;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }
  if (bestScore === 0 || tied) return null;
  return best;
}

const INQUIRY_TYPE_TO_LABOR: Record<string, LaborType> = {
  'refinish operations': 'refinish',
  'body operations': 'body',
  'paint operations': 'paint',
  'frame': 'frame',
  'frame operations': 'frame',
  'mechanical': 'mechanical',
  'mechanical operations': 'mechanical',
};

function deriveLaborType(inquiryType: string | undefined): LaborType | undefined {
  if (!inquiryType) return undefined;
  return INQUIRY_TYPE_TO_LABOR[inquiryType.toLowerCase().trim()];
}

function normalizeStatus(raw: string): InquiryStatus {
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith('resolved')) return 'resolved';
  if (lower.startsWith('closed')) return 'closed';
  return 'pending';
}

function collapseWhitespace(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function parseSubmittedAt(raw: string): Date {
  const trimmed = raw.trim();
  // Page format: "2026-04-08 12:14:58" — convert to ISO-like for Date parser.
  const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error(`Bad submittedAt: ${raw}`);
  return d;
}

interface ParsedTables {
  submittedRaw: string;
  statusRaw: string;
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  body?: string;
  labels: Record<string, string>;
}

/**
 * Old DEG inquiries (~pre-2020) lack discrete "Issue Summary" / "Suggested Action" /
 * "Area of Vehicle" labels. Instead, all three are embedded inside a single "Description"
 * field, separated by `Section{N}_{FieldName}` markers (Section6 and Section3 typically).
 * Section6 is the canonical content; Section3 is a duplicate subset on some pages.
 */
function parseDescriptionField(desc: string): {
  issueSummary?: string;
  suggestedAction?: string;
  areaOfVehicle?: string;
} {
  const out: { issueSummary?: string; suggestedAction?: string; areaOfVehicle?: string } = {};
  const re = /Section\d+_(\w+)\s+([^]*?)(?=\s+Section\d+_\w+|\s*$)/g;
  for (;;) {
    const m = re.exec(desc);
    if (!m) break;
    const field = (m[1] ?? '').toLowerCase();
    const value = (m[2] ?? '').trim();
    if (!value) continue;
    if (field === 'issuesummary' && !out.issueSummary) out.issueSummary = value;
    else if (field === 'suggestedaction' && !out.suggestedAction) out.suggestedAction = value;
    else if (field === 'areavehicle' && !out.areaOfVehicle) out.areaOfVehicle = value;
  }
  return out;
}

function parseTables(html: string): ParsedTables {
  const $ = load(html);
  const tables = $('form table.widefat').toArray();

  let submittedRaw = '';
  let statusRaw = '';
  let vehicleYear: number | undefined;
  let vehicleMake: string | undefined;
  let vehicleModel: string | undefined;
  let body: string | undefined;
  const labels: Record<string, string> = {};

  for (const tbl of tables) {
    const $tbl = $(tbl);
    const headerCells = $tbl
      .find('thead th')
      .map((_, h) => $(h).text().trim())
      .get();

    if (headerCells.length > 0) {
      const headerSet = new Set(headerCells.map((h) => h.toLowerCase()));
      const $firstRow = $tbl.find('tbody tr').first();

      if (headerSet.has('submitted') && headerSet.has('status')) {
        const cells = $firstRow
          .find('th,td')
          .map((_, c) => collapseWhitespace($(c).text()))
          .get();
        if (cells.length >= 2) {
          submittedRaw = cells[0] ?? '';
          statusRaw = cells[1] ?? '';
        }
      } else if (headerSet.has('year') && headerSet.has('make')) {
        const cells = $firstRow
          .find('th,td')
          .map((_, c) => collapseWhitespace($(c).text()))
          .get();
        const yearStr = cells[0] ?? '';
        const yearDigits = yearStr.replace(/\D/g, '');
        if (yearDigits) {
          const y = parseInt(yearDigits, 10);
          if (!isNaN(y)) vehicleYear = y;
        }
        if (cells[1]) vehicleMake = cells[1];
        if (cells[2]) vehicleModel = cells[2];
        if (cells[3]) body = cells[3];
      }
      continue;
    }

    // Label/value table (no thead).
    const rows = $tbl.find('tbody tr').toArray();
    for (const tr of rows) {
      const $tds = $(tr).find('td');
      if ($tds.length < 2) continue;
      const label = collapseWhitespace($tds.eq(0).text());
      // Preserve <br/> as space, then collapse.
      $tds.eq(1).find('br').replaceWith(' ');
      const value = collapseWhitespace($tds.eq(1).text());
      if (label) labels[label] = value;
    }
  }

  return { submittedRaw, statusRaw, vehicleYear, vehicleMake, vehicleModel, body, labels };
}

function extractResolvedAt(resolution: string | undefined): Date | undefined {
  if (!resolution) return undefined;
  const m = resolution.match(/Estimated Release Date:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i);
  if (!m || !m[1]) return undefined;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? undefined : d;
}

export function parseInquiryHtml(id: string, html: string): DEGInquiry {
  const url = `${BASE_URL}/inquiries/${id}/`;
  const parsed = parseTables(html);

  const trackingNumber = parsed.labels['Tracking #'] ?? id;
  const resolution = parsed.labels['Resolution'] || undefined;
  const inquiryType = parsed.labels['Inquiry type'] || undefined;
  let areaOfVehicle = parsed.labels['Area of Vehicle'] || undefined;
  let issueSummary = parsed.labels['Issue Summary'] ?? '';
  let suggestedAction = parsed.labels['Suggested Action'] || undefined;

  // Old-format fallback: parse Description field for Section{N}_{Field} markers.
  const descriptionRaw = parsed.labels['Description'];
  if (descriptionRaw && (!issueSummary || !suggestedAction || !areaOfVehicle)) {
    const fromDesc = parseDescriptionField(descriptionRaw);
    if (!issueSummary && fromDesc.issueSummary) issueSummary = fromDesc.issueSummary;
    if (!suggestedAction && fromDesc.suggestedAction) suggestedAction = fromDesc.suggestedAction;
    if (!areaOfVehicle && fromDesc.areaOfVehicle) areaOfVehicle = fromDesc.areaOfVehicle;
  }

  if (!parsed.submittedRaw) {
    throw new Error(`Could not parse Submitted timestamp for inquiry ${id}`);
  }
  if (!issueSummary) {
    throw new Error(`Could not parse Issue Summary for inquiry ${id}`);
  }

  const submittedAt = parseSubmittedAt(parsed.submittedRaw);
  const status = normalizeStatus(parsed.statusRaw);
  const ip = classifyIP([resolution, issueSummary, suggestedAction].filter((s): s is string => !!s).join('\n'));
  const laborType = deriveLaborType(inquiryType);
  const resolvedAt = extractResolvedAt(resolution);

  const vehicleStr = [parsed.vehicleYear, parsed.vehicleMake, parsed.vehicleModel]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .join(' ');
  const titleTail = [inquiryType, areaOfVehicle].filter((s): s is string => !!s).join(': ');
  const title =
    vehicleStr && titleTail
      ? `${vehicleStr} — ${titleTail}`
      : titleTail || vehicleStr || `DEG Inquiry ${trackingNumber}`;

  const lastUpdated = resolvedAt ?? submittedAt;

  const draft: DEGInquiry = {
    id: trackingNumber,
    title,
    url,
    lastUpdated,
    metadata: {
      statusRaw: parsed.statusRaw,
      scrapedAt: new Date().toISOString(),
    },
    inquiryNumber: trackingNumber,
    ip,
    inquiryType,
    areaOfVehicle,
    vehicleYear: parsed.vehicleYear,
    vehicleMake: parsed.vehicleMake,
    vehicleModel: parsed.vehicleModel,
    body: parsed.body,
    laborType,
    issueSummary,
    suggestedAction,
    resolution,
    status,
    submittedAt,
    resolvedAt,
  };

  return DEGInquirySchema.parse(draft);
}

export interface FetchInquiryResult {
  ok: boolean;
  status: number;
  inquiry?: DEGInquiry;
  reason?: string;
  attempts: number;
}

export interface FetchOpts {
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  fetchImpl?: typeof fetch;
}

export async function fetchInquiry(
  id: string | number,
  opts: FetchOpts = {},
): Promise<FetchInquiryResult> {
  const maxRetries = opts.maxRetries ?? 5;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${BASE_URL}/inquiries/${id}/`;
  let backoffMs = opts.initialBackoffMs ?? 5000;
  const maxBackoffMs = opts.maxBackoffMs ?? 5 * 60 * 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
    } catch (err) {
      if (attempt === maxRetries) {
        return {
          ok: false,
          status: 0,
          reason: `network error: ${(err as Error).message}`,
          attempts: attempt + 1,
        };
      }
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      continue;
    }

    if (res.status === 404) {
      return { ok: false, status: 404, reason: 'not found', attempts: attempt + 1 };
    }
    // DEG soft-redirects unknown/private inquiry IDs to /deg-database/ with a 200.
    // Treat any URL that no longer points at /inquiries/{id}/ as a miss.
    const expectedPath = `/inquiries/${id}/`;
    if (!res.url.includes(expectedPath)) {
      return {
        ok: false,
        status: res.status,
        reason: `redirected to ${res.url}`,
        attempts: attempt + 1,
      };
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === maxRetries) {
        return {
          ok: false,
          status: res.status,
          reason: `gave up after ${maxRetries} retries`,
          attempts: attempt + 1,
        };
      }
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      continue;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        reason: 'unexpected status',
        attempts: attempt + 1,
      };
    }

    const html = await res.text();
    try {
      const inquiry = parseInquiryHtml(String(id), html);
      return { ok: true, status: res.status, inquiry, attempts: attempt + 1 };
    } catch (err) {
      return {
        ok: false,
        status: res.status,
        reason: `parse error: ${(err as Error).message}`,
        attempts: attempt + 1,
      };
    }
  }

  return { ok: false, status: 0, reason: 'unreachable retry loop', attempts: maxRetries + 1 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
