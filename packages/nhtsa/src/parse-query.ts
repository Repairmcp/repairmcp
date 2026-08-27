/**
 * Free-text vehicle query parsing, for the ChatGPT connector `search` tool
 * only. Claude clients pass structured year/make/model to the `nhtsa_*` tools
 * and never come through here.
 *
 * Strategy: find the model year (a plausible 4-digit token) and the make (a
 * token matching a known-makes list, checked two-token-first so "land rover"
 * survives) anywhere in the query; the token after the make is the model;
 * everything else becomes the complaint keyword. This handles both "2020 Ford
 * Transit steering" and "steering complaints ford transit 2020". When no
 * known make appears, fall back to the documented contract — year, then make,
 * then model — so rare makes still work when the user leads with the vehicle.
 *
 * NHTSA matches model names exactly, so the adapter revalidates the model
 * against NHTSA's own vocabulary when a parsed query returns nothing.
 */

export interface ParsedVehicleQuery {
  modelYear: number;
  make: string;
  model: string;
  /** Remaining terms after year/make/model — the complaint keyword. */
  keyword?: string;
}

/** Lowercase; hyphens preserved (NHTSA writes "MERCEDES-BENZ"). */
const KNOWN_MAKES = new Set([
  'acura', 'alfa romeo', 'aston martin', 'audi', 'bmw', 'buick', 'cadillac',
  'chevrolet', 'chrysler', 'dodge', 'fiat', 'ford', 'freightliner', 'genesis',
  'gmc', 'hino', 'honda', 'hummer', 'hyundai', 'infiniti', 'international',
  'isuzu', 'jaguar', 'jeep', 'kenworth', 'kia', 'land rover', 'lexus',
  'lincoln', 'lucid', 'mazda', 'mercedes-benz', 'mercury', 'mini',
  'mitsubishi', 'nissan', 'oldsmobile', 'peterbilt', 'polestar', 'pontiac',
  'porsche', 'ram', 'rivian', 'rolls royce', 'saab', 'saturn', 'scion',
  'smart', 'subaru', 'suzuki', 'tesla', 'toyota', 'volkswagen', 'volvo',
]);

const MAKE_ALIASES: Record<string, string> = {
  chevy: 'chevrolet',
  vw: 'volkswagen',
  mercedes: 'mercedes-benz',
  'mercedes benz': 'mercedes-benz',
  landrover: 'land rover',
};

const YEAR_MIN = 1949;

function canonicalMake(candidate: string): string | null {
  const aliased = MAKE_ALIASES[candidate] ?? candidate;
  return KNOWN_MAKES.has(aliased) ? aliased : null;
}

export function parseVehicleQuery(query: string, now = new Date()): ParsedVehicleQuery | null {
  const tokens = query.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
  if (tokens.length < 3) return null;

  const yearMax = now.getUTCFullYear() + 2;
  const yearIndex = tokens.findIndex((token) => {
    if (!/^\d{4}$/.test(token)) return false;
    const year = Number.parseInt(token, 10);
    return year >= YEAR_MIN && year <= yearMax;
  });
  if (yearIndex < 0) return null;
  const modelYear = Number.parseInt(tokens[yearIndex]!, 10);
  const rest = tokens.filter((_, i) => i !== yearIndex);

  // Find a known make anywhere, two-token candidates first.
  let makeIndex = -1;
  let makeTokenCount = 0;
  let make: string | null = null;
  for (let i = 0; i < rest.length; i += 1) {
    if (i + 1 < rest.length) {
      const two = canonicalMake(`${rest[i]} ${rest[i + 1]}`);
      if (two) {
        makeIndex = i;
        makeTokenCount = 2;
        make = two;
        break;
      }
    }
    const one = canonicalMake(rest[i]!);
    if (one) {
      makeIndex = i;
      makeTokenCount = 1;
      make = one;
      break;
    }
  }

  // Unknown make: fall back to the documented "year make model ..." order.
  if (make === null) {
    makeIndex = 0;
    makeTokenCount = 1;
    make = rest[0]!;
  }

  const modelIndex = makeIndex + makeTokenCount;
  const model = rest[modelIndex];
  if (!model) return null;

  const keywordTokens = rest.filter(
    (_, i) => i < makeIndex || i > modelIndex,
  );
  const keyword = keywordTokens.join(' ') || undefined;

  return { modelYear, make, model, keyword };
}
