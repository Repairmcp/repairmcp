import { describe, expect, test } from 'bun:test';
import { parseVehicleQuery } from '../src/parse-query';

const NOW = new Date('2026-08-27T00:00:00.000Z');

describe('parseVehicleQuery', () => {
  test('year-first with trailing keyword', () => {
    expect(parseVehicleQuery('2020 Ford Transit steering', NOW)).toEqual({
      modelYear: 2020,
      make: 'ford',
      model: 'transit',
      keyword: 'steering',
    });
  });

  test('keyword-first with year last still finds the vehicle', () => {
    expect(parseVehicleQuery('steering complaints ford transit 2020', NOW)).toEqual({
      modelYear: 2020,
      make: 'ford',
      model: 'transit',
      keyword: 'steering complaints',
    });
  });

  test('two-token make survives', () => {
    expect(parseVehicleQuery('2022 land rover defender air suspension', NOW)).toEqual({
      modelYear: 2022,
      make: 'land rover',
      model: 'defender',
      keyword: 'air suspension',
    });
  });

  test('aliases map to NHTSA vocabulary', () => {
    expect(parseVehicleQuery('2019 chevy silverado brake', NOW)?.make).toBe('chevrolet');
    expect(parseVehicleQuery('2021 mercedes sprinter door', NOW)?.make).toBe('mercedes-benz');
  });

  test('unknown make falls back to year-make-model order', () => {
    expect(parseVehicleQuery('2023 ineos grenadier lights', NOW)).toEqual({
      modelYear: 2023,
      make: 'ineos',
      model: 'grenadier',
      keyword: 'lights',
    });
  });

  test('no plausible year returns null', () => {
    expect(parseVehicleQuery('ford transit steering', NOW)).toBeNull();
    expect(parseVehicleQuery('1890 ford transit', NOW)).toBeNull();
  });

  test('a legal question does not parse as a vehicle', () => {
    expect(parseVehicleQuery('can a repair shop disable a safety device', NOW)).toBeNull();
  });

  test('year with only one other token returns null', () => {
    expect(parseVehicleQuery('2020 ford', NOW)).toBeNull();
  });
});
