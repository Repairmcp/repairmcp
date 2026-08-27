/**
 * Every NHTSA URL this package requests, in one module. All parameters go
 * through URLSearchParams / encodeURIComponent, so a make or model containing
 * spaces or punctuation cannot break a request.
 *
 * Endpoint shapes verified live 2026-08-27. Two things worth knowing:
 *   - recalls payloads use Capitalized keys (`Count`, `results`), complaints
 *     use lowercase (`count`) — the client's resultArray handles both.
 *   - recall dates arrive DD/MM/YYYY, complaint dates MM/DD/YYYY. The date
 *     handling lives in client.ts (`normalizeDateString`), not here, but the
 *     divergence is per-endpoint, which is why each endpoint has its own
 *     builder rather than a generic one.
 */

const NHTSA_API_BASE = 'https://api.nhtsa.gov';

/** vPIC lives on its own host — the cache layer uses this to exempt VIN decodes. */
export const VPIC_API_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

export function decodeVinUrl(vin: string, modelYear?: number): string {
  const params = new URLSearchParams({ format: 'json' });
  if (modelYear !== undefined) {
    params.set('modelyear', String(modelYear));
  }

  return `${VPIC_API_BASE}/DecodeVinValuesExtended/${encodeURIComponent(vin)}?${params.toString()}`;
}

export function recallByVehicleUrl(input: {
  modelYear: number;
  make: string;
  model: string;
}): string {
  const params = new URLSearchParams({
    make: input.make,
    model: input.model,
    modelYear: String(input.modelYear),
  });
  return `${NHTSA_API_BASE}/recalls/recallsByVehicle?${params.toString()}`;
}

export function campaignUrl(campaignNumber: string): string {
  const params = new URLSearchParams({ campaignNumber });
  return `${NHTSA_API_BASE}/recalls/campaignNumber?${params.toString()}`;
}

export function complaintsByVehicleUrl(input: {
  modelYear: number;
  make: string;
  model: string;
}): string {
  const params = new URLSearchParams({
    make: input.make,
    model: input.model,
    modelYear: String(input.modelYear),
  });
  return `${NHTSA_API_BASE}/complaints/complaintsByVehicle?${params.toString()}`;
}

/**
 * NHTSA's own model vocabulary for a make + year, per issue type
 * (`'r'` recalls, `'c'` complaints). The by-vehicle endpoints match model
 * names exactly, so this list is what turns "zero results" from ambiguous
 * into diagnosable — see the zero-result honesty notes in tools.ts.
 */
export function productModelsUrl(
  input: { modelYear: number; make: string },
  issueType: 'r' | 'c',
): string {
  const params = new URLSearchParams({
    modelYear: String(input.modelYear),
    make: input.make,
    issueType,
  });
  return `${NHTSA_API_BASE}/products/vehicle/models?${params.toString()}`;
}

export function complaintUrl(odiNumber: string): string {
  const params = new URLSearchParams({ odinumber: odiNumber });
  return `${NHTSA_API_BASE}/complaints/odinumber?${params.toString()}`;
}

export function safetyRatingMakeUrl(input: {
  modelYear: number;
  make: string;
}): string {
  return `${NHTSA_API_BASE}/SafetyRatings/modelyear/${encodeURIComponent(
    String(input.modelYear),
  )}/make/${encodeURIComponent(input.make)}?format=json`;
}

export function safetyRatingVariantsUrl(input: {
  modelYear: number;
  make: string;
  model: string;
}): string {
  return `${NHTSA_API_BASE}/SafetyRatings/modelyear/${encodeURIComponent(
    String(input.modelYear),
  )}/make/${encodeURIComponent(input.make)}/model/${encodeURIComponent(input.model)}`;
}

export function safetyRatingVehicleUrl(vehicleId: number): string {
  return `${NHTSA_API_BASE}/SafetyRatings/VehicleId/${encodeURIComponent(String(vehicleId))}`;
}
