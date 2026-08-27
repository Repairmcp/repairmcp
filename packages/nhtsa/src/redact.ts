/**
 * VIN redaction, applied systemically: any 17-character VIN-like token is
 * scrubbed from URLs, error messages, and raw API records before they can
 * appear in a tool payload or a log line. Only the last six characters — the
 * serial portion, which identifies no owner — ever survive.
 *
 * This is a privacy posture, not a legal requirement: a VIN is vehicle data,
 * not personal data, and it is passed through to NHTSA's own decoder (which
 * exists for exactly that). But "we only ever hold the last six" is a claim
 * the /legal page makes, so it is enforced here at one choke point rather
 * than remembered at many.
 */

export const VIN_LIKE_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;

export function isVinLike(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(value.trim());
}

export function redactVin(vin: string): { redacted: string; vinLast6: string } {
  const clean = vin.trim().toUpperCase();
  const vinLast6 = clean.slice(-6);

  return {
    redacted: `${'*'.repeat(Math.max(0, clean.length - 6))}${vinLast6}`,
    vinLast6,
  };
}

export function redactVinLikeText(value: string): string {
  return value.replace(VIN_LIKE_PATTERN, (match) => redactVin(match).redacted);
}
