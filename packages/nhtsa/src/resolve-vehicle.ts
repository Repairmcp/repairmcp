/**
 * Shared vehicle-input resolution for the recall and complaint tools: a shop
 * hands us either a VIN (decoded through NHTSA's own vPIC service) or an
 * explicit year/make/model. One resolver so both tools fail the same way,
 * name the same missing fields, and apply the same VIN hygiene — the full
 * VIN goes to vPIC and nowhere else; only vinLast6 ever appears in output.
 */
import type { NhtsaClient, VehicleLookupInput } from './client.js';
import type { NhtsaVehicleIdentity } from './schema.js';
import { isVinLike, redactVin } from './redact.js';
import { callNhtsa, nowIso, type NhtsaUnavailablePayload } from './live.js';

export interface VehicleToolInput {
  vin?: string;
  modelYear?: number;
  make?: string;
  model?: string;
}

export interface ResolvedVehicle {
  modelYear: number;
  make: string;
  model: string;
  /** Present when the vehicle came from a VIN decode. */
  vinLast6?: string;
  /** Decoded identity extras (body class, trim, ...) when a VIN was supplied. */
  decoded?: Pick<NhtsaVehicleIdentity, 'trim' | 'bodyClass' | 'vehicleType'>;
}

export interface VehicleInputErrorPayload {
  inputError: string;
  retrievedAt: string;
  [key: string]: unknown;
}

export type ResolveVehicleResult =
  | { ok: true; lookup: VehicleLookupInput; vehicle: ResolvedVehicle }
  | { ok: false; payload: VehicleInputErrorPayload | NhtsaUnavailablePayload };

function inputError(message: string): { ok: false; payload: VehicleInputErrorPayload } {
  return { ok: false, payload: { inputError: message, retrievedAt: nowIso() } };
}

export async function resolveVehicle(
  client: NhtsaClient,
  input: VehicleToolInput,
): Promise<ResolveVehicleResult> {
  if (input.vin !== undefined && input.vin.trim() !== '') {
    const vin = input.vin.trim();
    if (!isVinLike(vin)) {
      return inputError(
        `"${redactVin(vin).redacted}" is not a valid 17-character VIN. ` +
          'Pass the full VIN, or pass modelYear, make, and model instead.',
      );
    }

    const decoded = await callNhtsa(() => client.decodeVin(vin, input.modelYear));
    if (!decoded.ok) return decoded;

    const identity = decoded.value;
    const modelYear = input.modelYear ?? identity.modelYear;
    const make = input.make ?? identity.make;
    const model = input.model ?? identity.model;
    if (modelYear === undefined || !make || !model) {
      const missing = [
        modelYear === undefined ? 'model year' : null,
        !make ? 'make' : null,
        !model ? 'model' : null,
      ].filter(Boolean);
      return inputError(
        `NHTSA's VIN decoder could not determine the ${missing.join(', ')} for this VIN ` +
          `(last six: ${identity.vinLast6 ?? 'unknown'}). Pass modelYear, make, and model explicitly.`,
      );
    }

    return {
      ok: true,
      lookup: { modelYear, make, model },
      vehicle: {
        modelYear,
        make,
        model,
        vinLast6: identity.vinLast6,
        decoded: {
          trim: identity.trim,
          bodyClass: identity.bodyClass,
          vehicleType: identity.vehicleType,
        },
      },
    };
  }

  const missing = [
    input.modelYear === undefined ? 'modelYear' : null,
    !input.make?.trim() ? 'make' : null,
    !input.model?.trim() ? 'model' : null,
  ].filter(Boolean);
  if (missing.length > 0) {
    return inputError(
      `Missing ${missing.join(', ')}. Pass either a 17-character vin, or all three of modelYear, make, and model.`,
    );
  }

  const lookup: VehicleLookupInput = {
    modelYear: input.modelYear!,
    make: input.make!.trim(),
    model: input.model!.trim(),
  };
  return { ok: true, lookup, vehicle: { ...lookup } };
}
