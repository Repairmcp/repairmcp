import { describe, expect, test } from 'bun:test';
import { NhtsaApiError, NhtsaClient } from '../src/client.js';
import {
  NhtsaComplaintSchema,
  NhtsaRecallSchema,
  NhtsaSafetyRatingVariantSchema,
  NhtsaVehicleIdentitySchema,
} from '../src/schema.js';

describe('NHTSA schemas', () => {
  test('vehicle identity accepts normalized vPIC fields', () => {
    const parsed = NhtsaVehicleIdentitySchema.parse({
      vinLast6: '123456',
      modelYear: 2021,
      make: 'TOYOTA',
      model: 'Camry',
      bodyClass: 'Sedan/Saloon',
      plantCountry: 'UNITED STATES',
      raw: { Make: 'TOYOTA' },
    });

    expect(parsed.modelYear).toBe(2021);
    expect(parsed.vinLast6).toBe('123456');
  });

  test('recall schema accepts campaign fields', () => {
    const parsed = NhtsaRecallSchema.parse({
      campaignNumber: '12V176000',
      manufacturer: 'Example Manufacturer',
      component: 'AIR BAGS',
      summary: 'Summary text',
      consequence: 'Consequence text',
      remedy: 'Remedy text',
      reportReceivedDate: '2012-04-20',
      sourceUrl: 'https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber=12V176000',
    });

    expect(parsed.campaignNumber).toBe('12V176000');
  });

  test('complaint schema labels allegations', () => {
    const parsed = NhtsaComplaintSchema.parse({
      odiNumber: '11184030',
      modelYear: 2012,
      make: 'ACURA',
      model: 'RDX',
      component: 'AIR BAGS',
      summary: 'Air bag warning light is on.',
      sourceUrl: 'https://api.nhtsa.gov/complaints/odinumber?odinumber=11184030',
      allegationCaveat: 'Consumer complaint; not a defect finding.',
    });

    expect(parsed.allegationCaveat).toContain('complaint');
  });

  test('safety rating variant schema accepts vehicle id', () => {
    const parsed = NhtsaSafetyRatingVariantSchema.parse({
      vehicleId: 7520,
      modelYear: 2013,
      make: 'Acura',
      model: 'RDX',
      vehicleDescription: '2013 Acura RDX SUV AWD',
      sourceUrl: 'https://api.nhtsa.gov/SafetyRatings/VehicleId/7520',
    });

    expect(parsed.vehicleId).toBe(7520);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('NhtsaClient normalization', () => {
  test('normalizes vPIC decode response, passes model year hint, and redacts VIN from output', async () => {
    const calls: string[] = [];
    const client = new NhtsaClient({
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse({
          Results: [
            {
              VIN: '1HGCM82633A004352',
              ModelYear: '2003',
              Make: 'HONDA',
              Model: 'Accord',
              Trim: 'EX',
              BodyClass: 'Coupe',
              VehicleType: 'PASSENGER CAR',
              PlantCountry: 'UNITED STATES',
              'Other Restraint System Info': 'Front airbags',
              ErrorCode: '0',
            },
          ],
        });
      },
    });

    const result = await client.decodeVin('1HGCM82633A004352', 2003);

    expect(calls[0]).toContain('/DecodeVinValuesExtended/1HGCM82633A004352');
    expect(calls[0]).toContain('modelyear=2003');
    expect(result.vinLast6).toBe('004352');
    expect(result.make).toBe('HONDA');
    expect(result.modelYear).toBe(2003);
    expect(result.bodyClass).toBe('Coupe');
    expect(JSON.stringify(result)).not.toContain('1HGCM82633A004352');
  });

  test('normalizes recall records', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () =>
        jsonResponse({
          results: [
            {
              NHTSACampaignNumber: '12V176000',
              Manufacturer: 'Example Manufacturer',
              Component: 'AIR BAGS',
              Summary: 'Summary text',
              Consequence: 'Consequence text',
              Remedy: 'Remedy text',
              Notes: 'Owner notification text',
              ReportReceivedDate: '20/04/2012',
            },
          ],
        }),
    });

    const recalls = await client.getRecalls({
      modelYear: 2012,
      make: 'Acura',
      model: 'RDX',
    });

    expect(recalls[0]?.campaignNumber).toBe('12V176000');
    expect(recalls[0]?.component).toBe('AIR BAGS');
    expect(recalls[0]?.reportReceivedDate).toBe('2012-04-20');
    expect(recalls[0]?.sourceUrl).toContain('/recalls/recallsByVehicle?');
  });

  test('normalizes complaint records and labels them as allegations', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () =>
        jsonResponse({
          results: [
            {
              ODINumber: '11184030',
              ModelYear: '2012',
              Make: 'ACURA',
              Model: 'RDX',
              Component: 'AIR BAGS',
              Summary: 'Air bag warning light is on.',
              Crash: 'No',
              Fire: 'Y',
              Injuries: '2',
              Deaths: '0',
              DateComplaintFiled: '03/28/2019',
            },
          ],
        }),
    });

    const complaints = await client.searchComplaints({
      modelYear: 2012,
      make: 'Acura',
      model: 'RDX',
    });

    expect(complaints[0]?.odiNumber).toBe('11184030');
    expect(complaints[0]?.modelYear).toBe(2012);
    expect(complaints[0]?.crash).toBe(false);
    expect(complaints[0]?.fire).toBe(true);
    expect(complaints[0]?.injuryCount).toBe(2);
    expect(complaints[0]?.dateComplaintFiled).toBe('2019-03-28');
    expect(complaints[0]?.allegationCaveat).toContain('not a NHTSA defect finding');
  });

  // The two NHTSA APIs disagree about date order (verified on the wire
  // 2026-08-27): recalls arrive DD/MM/YYYY, complaints MM/DD/YYYY. A date with
  // both fields <= 12 is ambiguous on its face, so only the per-endpoint
  // preference decides — these two tests exist so a future "simplification" to
  // one shared parser fails loudly instead of silently swapping months.
  test('ambiguous recall date parses day-first (DD/MM/YYYY)', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () =>
        jsonResponse({
          results: [
            {
              NHTSACampaignNumber: '21V978000',
              ReportReceivedDate: '05/04/2021',
            },
          ],
        }),
    });

    const recalls = await client.getRecalls({
      modelYear: 2020,
      make: 'Ford',
      model: 'Transit',
    });

    expect(recalls[0]?.reportReceivedDate).toBe('2021-04-05');
  });

  test('ambiguous complaint date parses month-first (MM/DD/YYYY)', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () =>
        jsonResponse({
          results: [
            {
              odiNumber: '11753468',
              dateComplaintFiled: '05/04/2021',
            },
          ],
        }),
    });

    const complaints = await client.searchComplaints({
      modelYear: 2020,
      make: 'Ford',
      model: 'Transit',
    });

    expect(complaints[0]?.dateComplaintFiled).toBe('2021-05-04');
  });

  test('carries stop-drive flags and unitsAffected through campaign lookup', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () =>
        jsonResponse({
          results: [
            {
              NHTSACampaignNumber: '21V978000',
              ReportReceivedDate: '16/12/2021',
              parkIt: true,
              parkOutSide: false,
              overTheAirUpdate: false,
              PotentialNumberofUnitsAffected: 4548,
            },
          ],
        }),
    });

    const recalls = await client.getCampaign('21V978000');

    expect(recalls[0]?.reportReceivedDate).toBe('2021-12-16');
    expect(recalls[0]?.parkIt).toBe(true);
    expect(recalls[0]?.parkOutSide).toBe(false);
    expect(recalls[0]?.unitsAffected).toBe(4548);
  });

  test('a trim series appended to the model falls back to the real NHTSA model name', async () => {
    const calls: string[] = [];
    const client = new NhtsaClient({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        calls.push(textUrl);
        if (textUrl.includes('/recalls/recallsByVehicle?')) {
          if (textUrl.includes('model=Transit+250&')) {
            return jsonResponse({ message: 'Bad Request' }, 400);
          }
          return jsonResponse({
            results: [{ NHTSACampaignNumber: '21V978000', ReportReceivedDate: '16/12/2021' }],
          });
        }
        return jsonResponse({
          results: [{ model: 'TRANSIT' }, { model: 'TRANSIT CONNECT' }, { model: 'RANGER' }],
        });
      },
    });

    const recalls = await client.getRecalls({
      modelYear: 2020,
      make: 'Ford',
      model: 'Transit 250',
    });

    expect(calls[1]).toContain('issueType=r');
    expect(calls[2]).toContain('model=TRANSIT&');
    expect(recalls[0]?.campaignNumber).toBe('21V978000');
  });

  test('listModels returns the deduped model vocabulary for a make and year', async () => {
    const calls: string[] = [];
    const client = new NhtsaClient({
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse({
          results: [
            { modelYear: '2020', make: 'FORD', model: 'TRANSIT' },
            { modelYear: '2020', make: 'FORD', model: 'TRANSIT CONNECT' },
            { modelYear: '2020', make: 'FORD', model: 'TRANSIT' },
          ],
        });
      },
    });

    const models = await client.listModels({ modelYear: 2020, make: 'FORD' }, 'r');

    expect(calls[0]).toContain('/products/vehicle/models?');
    expect(calls[0]).toContain('issueType=r');
    expect(models).toEqual(['TRANSIT', 'TRANSIT CONNECT']);
  });

  test('falls back to NHTSA complaint product model names when generic model is rejected', async () => {
    const calls: string[] = [];
    const client = new NhtsaClient({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        calls.push(textUrl);

        if (textUrl.includes('/complaints/complaintsByVehicle?')) {
          if (textUrl.includes('model=F-150&')) {
            return jsonResponse({ message: 'Bad Request' }, 400);
          }

          return jsonResponse({
            results: [
              {
                odiNumber: '11678571',
                productYear: '2019',
                productMake: 'FORD',
                productModel: 'F-150',
                components: 'ENGINE',
                summary: 'Cam phaser rattle on startup.',
                dateComplaintFiled: '08/05/2025',
              },
            ],
          });
        }

        return jsonResponse({
          results: [
            { modelYear: '2019', make: 'FORD', model: 'F-150 SUPER CREW' },
            { modelYear: '2019', make: 'FORD', model: 'F-150 SUPERCAB' },
          ],
        });
      },
    });

    const complaints = await client.searchComplaints({
      modelYear: 2019,
      make: 'Ford',
      model: 'F-150',
    });

    expect(calls[0]).toContain('model=F-150&');
    expect(calls[1]).toContain('/products/vehicle/models?');
    expect(calls[2]).toContain('model=F-150+SUPER+CREW&');
    expect(complaints[0]?.odiNumber).toBe('11678571');
    expect(complaints[0]?.model).toBe('F-150');
    expect(complaints[0]?.component).toBe('ENGINE');
    expect(complaints[0]?.sourceUrl).toContain('F-150+SUPER+CREW');
  });

  test('normalizes safety rating variants and detail', async () => {
    const client = new NhtsaClient({
      fetchImpl: async (url) => {
        if (String(url).includes('/VehicleId/7520')) {
          return jsonResponse({
            Results: [
              {
                OverallRating: '5',
                OverallFrontCrashRating: '4',
                FrontCrashDriversideRating: '5',
                FrontCrashPassengersideRating: '4',
                OverallSideCrashRating: '5',
                RolloverRating: '4',
                SidePoleCrashRating: '5',
              },
            ],
          });
        }

        return jsonResponse({
          Results: [
            {
              VehicleId: '7520',
              VehicleDescription: '2013 Acura RDX SUV AWD',
            },
          ],
        });
      },
    });

    const variants = await client.getSafetyRatingVariants({
      modelYear: 2013,
      make: 'Acura',
      model: 'RDX',
    });
    const detail = await client.getSafetyRatingDetail(7520);

    expect(variants[0]?.vehicleId).toBe(7520);
    expect(variants[0]?.vehicleDescription).toBe('2013 Acura RDX SUV AWD');
    expect(detail?.overallRating).toBe('5');
    expect(detail?.frontCrashDriversideRating).toBe('5');
    expect(detail?.sourceUrl).toContain('/SafetyRatings/VehicleId/7520');
  });

  test('skips safety rating variants with missing or invalid vehicle ids', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () =>
        jsonResponse({
          Results: [
            {
              VehicleId: '7520',
              VehicleDescription: '2013 Acura RDX SUV AWD',
            },
            {
              VehicleId: 'not-a-number',
              VehicleDescription: 'Invalid vehicle id',
            },
            {
              VehicleDescription: 'Missing vehicle id',
            },
          ],
        }),
    });

    const variants = await client.getSafetyRatingVariants({
      modelYear: 2013,
      make: 'Acura',
      model: 'RDX',
    });

    expect(variants).toHaveLength(1);
    expect(variants[0]?.vehicleId).toBe(7520);
    expect(variants.some((variant) => variant.vehicleId === 0)).toBe(false);
  });

  test('expands generic pickup models into NHTSA safety rating model variants', async () => {
    const calls: string[] = [];
    const client = new NhtsaClient({
      fetchImpl: async (url) => {
        const textUrl = String(url);
        calls.push(textUrl);

        if (textUrl.endsWith('/make/Ford?format=json')) {
          return jsonResponse({
            Results: [
              { ModelYear: 2019, Make: 'FORD', Model: 'F-150 SUPER CREW', VehicleId: 0 },
              { ModelYear: 2019, Make: 'FORD', Model: 'F-150 SUPERCAB', VehicleId: 0 },
              { ModelYear: 2019, Make: 'FORD', Model: 'RANGER', VehicleId: 0 },
            ],
          });
        }

        if (textUrl.includes('model/F-150%20SUPER%20CREW')) {
          return jsonResponse({
            Results: [
              {
                VehicleId: '13277',
                VehicleDescription: '2019 Ford F-150 Super Crew PU/CC 4x4',
              },
            ],
          });
        }

        if (textUrl.includes('model/F-150%20SUPERCAB')) {
          return jsonResponse({
            Results: [
              {
                VehicleId: '13279',
                VehicleDescription: '2019 Ford F-150 Supercab PU/EC 4x4',
              },
            ],
          });
        }

        return jsonResponse({ Results: [] });
      },
    });

    const variants = await client.getSafetyRatingVariants({
      modelYear: 2019,
      make: 'Ford',
      model: 'F-150',
    });

    expect(calls[0]).toContain('/model/F-150');
    expect(calls[1]).toContain('/SafetyRatings/modelyear/2019/make/Ford?format=json');
    expect(variants.map((variant) => variant.vehicleId)).toEqual([13277, 13279]);
    expect(variants.every((variant) => variant.model === 'F-150')).toBe(true);
  });

  test('throws redacted API errors for failed VIN decode requests', async () => {
    const client = new NhtsaClient({
      fetchImpl: async () => jsonResponse({ error: 'nope' }, 500),
    });

    try {
      await client.decodeVin('1HGCM82633A004352');
      throw new Error('Expected decodeVin to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(NhtsaApiError);
      expect((error as NhtsaApiError).status).toBe(500);
      expect((error as NhtsaApiError).url).not.toContain('1HGCM82633A004352');
      expect((error as NhtsaApiError).url).toContain('004352');
    }
  });

  test('wraps rejected fetches without leaking raw VIN-like text', async () => {
    const rawVin = '1HGCM82633A004352';
    const client = new NhtsaClient({
      fetchImpl: async (url) => {
        throw new Error(`Network failed for ${String(url)} with ${rawVin}`);
      },
    });

    try {
      await client.decodeVin(rawVin);
      throw new Error('Expected decodeVin to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(NhtsaApiError);
      expect((error as NhtsaApiError).status).toBe(0);
      expect((error as NhtsaApiError).message).not.toContain(rawVin);
      expect((error as NhtsaApiError).url).not.toContain(rawVin);
      expect(String(error)).not.toContain(rawVin);
      expect((error as NhtsaApiError).message).toContain('004352');
      expect((error as NhtsaApiError).url).toContain('004352');
    }
  });

  test('aborts stalled requests after timeout without leaking raw VIN-like text', async () => {
    const rawVin = '1HGCM82633A004352';
    let sawSignal = false;
    let aborted = false;
    const client = new NhtsaClient({
      timeoutMs: 1,
      fetchImpl: async (_url, init) =>
        await new Promise<Response>((_resolve, reject) => {
          sawSignal = init?.signal instanceof AbortSignal;
          init?.signal?.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            },
            { once: true },
          );
          setTimeout(() => reject(new Error('fetch was not aborted')), 25);
        }),
    });

    try {
      await client.decodeVin(rawVin);
      throw new Error('Expected decodeVin to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(NhtsaApiError);
      expect((error as NhtsaApiError).status).toBe(0);
      expect(sawSignal).toBe(true);
      expect(aborted).toBe(true);
      expect((error as NhtsaApiError).message).not.toContain(rawVin);
      expect((error as NhtsaApiError).url).not.toContain(rawVin);
    }
  });
});
