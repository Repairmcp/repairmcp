import { load } from 'cheerio';
import type { ParsedBody } from './db.js';

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

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

export function parseDetailHtml(dbId: number, html: string): ParsedBody {
  const $ = load(html);
  const tables = $('form table.widefat').toArray();

  let year: number | null = null;
  let make: string | null = null;
  let model: string | null = null;
  let vehicleBody: string | null = null;
  let submittedDatetime: string | null = null;
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
      const cells = $firstRow
        .find('th,td')
        .map((_, c) => collapseWhitespace($(c).text()))
        .get();

      if (headerSet.has('submitted') && headerSet.has('status')) {
        submittedDatetime = cells.at(0) ?? null;
      } else if (headerSet.has('year') && headerSet.has('make')) {
        const yearStr = (cells.at(0) ?? '').replace(/\D/g, '');
        if (yearStr) {
          const y = parseInt(yearStr, 10);
          if (!isNaN(y)) year = y;
        }
        make = cells.at(1) ?? null;
        model = cells.at(2) ?? null;
        vehicleBody = cells.at(3) ?? null;
      }
      continue;
    }

    const rows = $tbl.find('tbody tr').toArray();
    for (const tr of rows) {
      const $tds = $(tr).find('td');
      if ($tds.length < 2) continue;
      const label = collapseWhitespace($tds.eq(0).text());
      $tds.eq(1).find('br').replaceWith(' ');
      const value = collapseWhitespace($tds.eq(1).text());
      if (label) labels[label] = value;
    }
  }

  let issueSummary: string | null = labels['Issue Summary'] ?? null;
  let suggestedAction: string | null = labels['Suggested Action'] ?? null;
  let areaOfVehicle: string | null = labels['Area of Vehicle'] ?? null;

  const descriptionRaw = labels['Description'];
  if (descriptionRaw && (!issueSummary || !suggestedAction || !areaOfVehicle)) {
    const fromDesc = parseDescriptionField(descriptionRaw);
    if (!issueSummary && fromDesc.issueSummary) issueSummary = fromDesc.issueSummary;
    if (!suggestedAction && fromDesc.suggestedAction) suggestedAction = fromDesc.suggestedAction;
    if (!areaOfVehicle && fromDesc.areaOfVehicle) areaOfVehicle = fromDesc.areaOfVehicle;
  }

  const rawResolution = labels['Resolution'] ?? '';
  const resolution = rawResolution || 'Awaiting resolution';
  const resolutionStatus: 'pending' | 'resolved' = rawResolution ? 'resolved' : 'pending';

  return {
    trackingId: labels['Tracking #'] ?? null,
    inquiryType: labels['Inquiry type'] ?? null,
    areaOfVehicle,
    oemPartNumber: labels['OEM Part Number'] ?? null,
    issueSummary,
    suggestedAction,
    resolution,
    resolutionStatus,
    year,
    make,
    model,
    vehicleBody,
    submittedDatetime,
  };
}
