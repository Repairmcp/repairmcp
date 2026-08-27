import {
  campaignUrl,
  complaintUrl,
  complaintsByVehicleUrl,
  decodeVinUrl,
  productModelsUrl,
  recallByVehicleUrl,
  safetyRatingMakeUrl,
  safetyRatingVariantsUrl,
  safetyRatingVehicleUrl,
} from './urls.js';
import { redactVin, redactVinLikeText } from './redact.js';
import {
  NhtsaComplaintSchema,
  NhtsaRecallSchema,
  NhtsaSafetyRatingDetailSchema,
  NhtsaSafetyRatingVariantSchema,
  NhtsaVehicleIdentitySchema,
} from './schema.js';
import type {
  NhtsaComplaint,
  NhtsaRecall,
  NhtsaSafetyRatingDetail,
  NhtsaSafetyRatingVariant,
  NhtsaVehicleIdentity,
} from './schema.js';

export interface NhtsaClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface VehicleLookupInput {
  modelYear: number;
  make: string;
  model: string;
}

export class NhtsaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = 'NhtsaApiError';
  }
}

export class NhtsaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: NhtsaClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async fetchJson(url: string): Promise<unknown> {
    let res: Response;
    const controller =
      typeof AbortController === 'undefined' ? undefined : new AbortController();
    const timeoutId =
      controller && this.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : undefined;

    try {
      res = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: controller?.signal,
      });
    } catch (error) {
      const detail = controller?.signal.aborted
        ? `request timed out after ${this.timeoutMs}ms`
        : sanitizeErrorMessage(error);
      throw new NhtsaApiError(
        `NHTSA request failed before response: ${detail}`,
        0,
        redactVinLikeText(url),
      );
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    if (!res.ok) {
      throw new NhtsaApiError(
        `NHTSA request failed with status ${res.status}`,
        res.status,
        redactVinLikeText(url),
      );
    }

    return await res.json();
  }

  async decodeVin(
    vin: string,
    modelYear?: number,
  ): Promise<NhtsaVehicleIdentity> {
    const data = await this.fetchJson(decodeVinUrl(vin, modelYear));
    const row = firstResult(data);
    const redacted = redactVin(vin);

    return NhtsaVehicleIdentitySchema.parse({
      vinLast6: redacted.vinLast6,
      modelYear: toInt(row['ModelYear']),
      make: toStringOrUndefined(row['Make']),
      model: toStringOrUndefined(row['Model']),
      trim: toStringOrUndefined(row['Trim']),
      bodyClass: toStringOrUndefined(row['BodyClass']),
      vehicleType: toStringOrUndefined(row['VehicleType']),
      plantCountry: toStringOrUndefined(row['PlantCountry']),
      restraintType: toStringOrUndefined(row['Other Restraint System Info']),
      raw: sanitizeRecord(row),
    });
  }

  // NHTSA answers an unrecognized make/model with HTTP 400, not an empty 200
  // (verified live 2026-08-27: "Transit 250" → 400). Both by-vehicle methods
  // therefore retry once with NHTSA's own nearest model name; a 400 that
  // survives the fallback propagates for the tool layer to diagnose against
  // the model vocabulary — it must never read as an outage.
  async getRecalls(input: VehicleLookupInput): Promise<NhtsaRecall[]> {
    const url = recallByVehicleUrl(input);
    let data: unknown;

    try {
      data = await this.fetchJson(url);
    } catch (error) {
      if (!(error instanceof NhtsaApiError) || error.status !== 400) {
        throw error;
      }

      const candidate = (await this.findRecallModelCandidates(input))[0];
      if (!candidate) throw error;

      const fallbackUrl = recallByVehicleUrl({ ...input, model: candidate });
      data = await this.fetchJson(fallbackUrl);

      return resultArray(data).map((row) => normalizeRecall(row, fallbackUrl));
    }

    return resultArray(data).map((row) => normalizeRecall(row, url));
  }

  async getCampaign(campaignNumber: string): Promise<NhtsaRecall[]> {
    const url = campaignUrl(campaignNumber);
    const data = await this.fetchJson(url);

    return resultArray(data).map((row) => normalizeRecall(row, url));
  }

  async searchComplaints(input: VehicleLookupInput): Promise<NhtsaComplaint[]> {
    const url = complaintsByVehicleUrl(input);
    let data: unknown;

    try {
      data = await this.fetchJson(url);
    } catch (error) {
      if (!(error instanceof NhtsaApiError) || error.status !== 400) {
        throw error;
      }

      const candidate = (await this.findComplaintModelCandidates(input))[0];
      if (!candidate) throw error;

      const fallbackUrl = complaintsByVehicleUrl({ ...input, model: candidate });
      data = await this.fetchJson(fallbackUrl);

      return resultArray(data).map((row) => normalizeComplaint(row, fallbackUrl));
    }

    return resultArray(data).map((row) => normalizeComplaint(row, url));
  }

  async getComplaint(odiNumber: string): Promise<NhtsaComplaint[]> {
    const url = complaintUrl(odiNumber);
    const data = await this.fetchJson(url);

    return resultArray(data).map((row) => normalizeComplaint(row, url));
  }

  async getSafetyRatingVariants(
    input: VehicleLookupInput,
  ): Promise<NhtsaSafetyRatingVariant[]> {
    const url = safetyRatingVariantsUrl(input);
    const direct = await this.fetchSafetyRatingVariants(input, url);
    if (direct.length > 0) return direct;

    const candidates = await this.findSafetyRatingModelCandidates(input);
    const seenVehicleIds = new Set<number>();
    const variants: NhtsaSafetyRatingVariant[] = [];

    for (const candidate of candidates) {
      const candidateUrl = safetyRatingVariantsUrl({
        ...input,
        model: candidate,
      });
      const candidateVariants = await this.fetchSafetyRatingVariants(
        input,
        candidateUrl,
      );

      for (const variant of candidateVariants) {
        if (seenVehicleIds.has(variant.vehicleId)) continue;
        seenVehicleIds.add(variant.vehicleId);
        variants.push(variant);
      }
    }

    return variants;
  }

  async getSafetyRatingDetail(
    vehicleId: number,
  ): Promise<NhtsaSafetyRatingDetail | null> {
    const url = safetyRatingVehicleUrl(vehicleId);
    const data = await this.fetchJson(url);
    const row = firstResult(data);
    if (Object.keys(row).length === 0) return null;

    return NhtsaSafetyRatingDetailSchema.parse({
      vehicleId,
      overallRating: toStringOrUndefined(row['OverallRating']),
      overallFrontCrashRating: toStringOrUndefined(
        row['OverallFrontCrashRating'],
      ),
      frontCrashDriversideRating: toStringOrUndefined(
        row['FrontCrashDriversideRating'],
      ),
      frontCrashPassengersideRating: toStringOrUndefined(
        row['FrontCrashPassengersideRating'],
      ),
      overallSideCrashRating: toStringOrUndefined(row['OverallSideCrashRating']),
      rolloverRating: toStringOrUndefined(row['RolloverRating']),
      sidePoleCrashRating: toStringOrUndefined(row['SidePoleCrashRating']),
      sourceUrl: url,
      raw: sanitizeRecord(row),
    });
  }

  /**
   * NHTSA's own model vocabulary for a make + year. The by-vehicle endpoints
   * match model names exactly, so a zero-result answer is only diagnosable
   * against this list — see the zero-result honesty handling in tools.ts.
   */
  async listModels(
    input: { modelYear: number; make: string },
    issueType: 'r' | 'c',
  ): Promise<string[]> {
    const data = await this.fetchJson(productModelsUrl(input, issueType));
    const seen = new Set<string>();
    const names: string[] = [];

    for (const row of resultArray(data)) {
      const name = toStringOrUndefined(row['model'] ?? row['Model']);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }

    return names;
  }

  private async findComplaintModelCandidates(
    input: VehicleLookupInput,
  ): Promise<string[]> {
    const data = await this.fetchJson(productModelsUrl(input, 'c'));
    return matchingModelNames(resultArray(data), input.model);
  }

  private async findRecallModelCandidates(
    input: VehicleLookupInput,
  ): Promise<string[]> {
    const data = await this.fetchJson(productModelsUrl(input, 'r'));
    return matchingModelNames(resultArray(data), input.model);
  }

  private async findSafetyRatingModelCandidates(
    input: VehicleLookupInput,
  ): Promise<string[]> {
    const data = await this.fetchJson(safetyRatingMakeUrl(input));
    return matchingModelNames(resultArray(data), input.model);
  }

  private async fetchSafetyRatingVariants(
    input: VehicleLookupInput,
    url: string,
  ): Promise<NhtsaSafetyRatingVariant[]> {
    const data = await this.fetchJson(url);

    return resultArray(data).flatMap((row) => {
      const vehicleId = toInt(row['VehicleId']);
      if (vehicleId === undefined || vehicleId <= 0) return [];

      return [
        NhtsaSafetyRatingVariantSchema.parse({
          vehicleId,
          modelYear: toInt(row['ModelYear']) ?? input.modelYear,
          make: toStringOrUndefined(row['Make']) ?? input.make,
          model: toStringOrUndefined(row['Model']) ?? input.model,
          vehicleDescription:
            toStringOrUndefined(row['VehicleDescription']) ?? '',
          sourceUrl: url,
        }),
      ];
    });
  }
}

function resultArray(data: unknown): Record<string, unknown>[] {
  if (!isRecord(data)) return [];

  const value = data['results'] ?? data['Results'];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function firstResult(data: unknown): Record<string, unknown> {
  return resultArray(data)[0] ?? {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function normalizeRecall(
  row: Record<string, unknown>,
  sourceUrl: string,
): NhtsaRecall {
  return NhtsaRecallSchema.parse({
    campaignNumber: String(
      row['NHTSACampaignNumber'] ??
        row['CampaignNumber'] ??
        row['campaignNumber'] ??
        row['NHTSA Campaign Number'] ??
        '',
    ),
    manufacturer: toStringOrUndefined(row['Manufacturer'] ?? row['MfrName']),
    component: toStringOrUndefined(row['Component'] ?? row['Components']),
    summary: toStringOrUndefined(row['Summary']),
    consequence: toStringOrUndefined(row['Consequence']),
    remedy: toStringOrUndefined(row['Remedy']),
    notes: toStringOrUndefined(row['Notes']),
    reportReceivedDate: normalizeDateString(row['ReportReceivedDate'], 'dmy'),
    parkIt: yesNoBool(row['parkIt'] ?? row['ParkIt']),
    parkOutSide: yesNoBool(row['parkOutSide'] ?? row['ParkOutSide']),
    overTheAirUpdate: yesNoBool(row['overTheAirUpdate'] ?? row['OverTheAirUpdate']),
    unitsAffected: toInt(row['PotentialNumberofUnitsAffected']),
    sourceUrl,
  });
}

function normalizeComplaint(
  row: Record<string, unknown>,
  sourceUrl: string,
): NhtsaComplaint {
  return NhtsaComplaintSchema.parse({
    odiNumber: String(
      row['ODINumber'] ?? row['odiNumber'] ?? row['ODI Number'] ?? '',
    ),
    modelYear: toInt(row['ModelYear'] ?? row['modelYear'] ?? row['productYear']),
    make: toStringOrUndefined(row['Make'] ?? row['make'] ?? row['productMake']),
    model: toStringOrUndefined(row['Model'] ?? row['model'] ?? row['productModel']),
    component: toStringOrUndefined(row['Component'] ?? row['components']),
    summary: toStringOrUndefined(row['Summary'] ?? row['summary']),
    crash: yesNoBool(row['Crash'] ?? row['crash']),
    fire: yesNoBool(row['Fire'] ?? row['fire']),
    injuryCount: toInt(
      row['Injuries'] ?? row['InjuryCount'] ?? row['numberOfInjuries'],
    ),
    deathCount: toInt(
      row['Deaths'] ?? row['DeathCount'] ?? row['numberOfDeaths'],
    ),
    dateComplaintFiled: normalizeDateString(
      row['DateComplaintFiled'] ??
        row['Date Filed'] ??
        row['dateComplaintFiled'],
      'mdy',
    ),
    sourceUrl,
    allegationCaveat: 'Consumer complaint; not a NHTSA defect finding.',
  });
}

function yesNoBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes' || normalized === 'true') {
    return true;
  }
  if (normalized === 'n' || normalized === 'no' || normalized === 'false') {
    return false;
  }

  return undefined;
}

function normalizeDateString(
  value: unknown,
  preferredOrder: 'dmy' | 'mdy',
): string | undefined {
  const text = toStringOrUndefined(value);
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!match) return text;

  const first = Number.parseInt(match[1] ?? '', 10);
  const second = Number.parseInt(match[2] ?? '', 10);
  const year = Number.parseInt(match[3] ?? '', 10);
  if (![first, second, year].every(Number.isFinite)) return text;

  const order =
    first > 12 ? 'dmy' : second > 12 ? 'mdy' : preferredOrder;
  const month = order === 'mdy' ? first : second;
  const day = order === 'mdy' ? second : first;
  if (month < 1 || month > 12 || day < 1 || day > 31) return text;

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function sanitizeRecord(row: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    sanitized[key] =
      typeof value === 'string' ? redactVinLikeText(value) : value;
  }

  return sanitized;
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return redactVinLikeText(error.message);
  }

  return redactVinLikeText(String(error));
}

/**
 * Candidate model names from NHTSA's vocabulary, best first: exact compact
 * match, then names the query is a prefix of ("F-150" → "F-150 SUPER CREW"),
 * then names that are a prefix of the query ("Transit 250" → "TRANSIT",
 * "Silverado 1500 LT" → "SILVERADO 1500") — shops append trim series to the
 * model constantly, and NHTSA's exact matching answers that with a 400.
 */
function matchingModelNames(
  rows: Record<string, unknown>[],
  queryModel: string,
): string[] {
  const query = compactModelName(queryModel);
  const seen = new Set<string>();
  const exact: string[] = [];
  const queryIsPrefix: string[] = [];
  const nameIsPrefix: string[] = [];

  for (const row of rows) {
    const name = toStringOrUndefined(row['model'] ?? row['Model']);
    if (!name || seen.has(name)) continue;

    const compact = compactModelName(name);
    if (compact === query) exact.push(name);
    else if (compact.startsWith(query)) queryIsPrefix.push(name);
    else if (compact.length >= 3 && query.startsWith(compact)) nameIsPrefix.push(name);
    else continue;

    seen.add(name);
  }

  // Within the reverse bucket, longer names first — "SILVERADO 1500" must
  // beat "SILVERADO" for the query "SILVERADO 1500 LT".
  nameIsPrefix.sort((a, b) => compactModelName(b).length - compactModelName(a).length);

  return [...exact, ...queryIsPrefix, ...nameIsPrefix];
}

function compactModelName(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '');
}
