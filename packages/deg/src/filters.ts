/**
 * Search filter parsing, shared by both adapters.
 *
 * `parseFilters` is the one place that decides what an incoming `filters` bag
 * means. The in-memory adapter then applies it with `inquiryMatchesFilters`;
 * the D1 adapter compiles the same struct into a SQL WHERE clause. Keeping the
 * parse shared is what makes "same filters, same records" true rather than
 * aspirational — the two only differ in how they execute, never in what they
 * accept.
 */
import type { DEGInquiry, InformationProvider } from './schema.js';

export interface DEGFilters {
  vehicleYear?: number;
  vehicleMake?: string;
  vehicleModel?: string;
  ip?: InformationProvider | 'unknown';
  status?: DEGInquiry['status'];
  inquiryType?: string;
}

export function parseFilters(raw: Record<string, unknown> | undefined): DEGFilters {
  if (!raw) return {};
  const out: DEGFilters = {};
  if (typeof raw['vehicleYear'] === 'number') out.vehicleYear = raw['vehicleYear'];
  if (typeof raw['vehicleMake'] === 'string') out.vehicleMake = raw['vehicleMake'];
  if (typeof raw['vehicleModel'] === 'string') out.vehicleModel = raw['vehicleModel'];
  if (typeof raw['ip'] === 'string') {
    const ip = raw['ip'];
    if (ip === 'CCC' || ip === 'Mitchell' || ip === 'Audatex' || ip === 'unknown') {
      out.ip = ip;
    }
  }
  if (typeof raw['status'] === 'string') {
    const s = raw['status'];
    if (s === 'pending' || s === 'resolved' || s === 'closed') out.status = s;
  }
  if (typeof raw['inquiryType'] === 'string') out.inquiryType = raw['inquiryType'];
  return out;
}

export function inquiryMatchesFilters(inq: DEGInquiry, filters: DEGFilters): boolean {
  if (filters.vehicleYear !== undefined && inq.vehicleYear !== filters.vehicleYear) return false;
  if (filters.vehicleMake) {
    const want = filters.vehicleMake.toLowerCase();
    const got = (inq.vehicleMake ?? '').toLowerCase();
    if (!got.includes(want)) return false;
  }
  if (filters.vehicleModel) {
    const want = filters.vehicleModel.toLowerCase();
    const got = (inq.vehicleModel ?? '').toLowerCase();
    if (!got.includes(want)) return false;
  }
  if (filters.ip !== undefined) {
    if (filters.ip === 'unknown') {
      if (inq.ip !== null) return false;
    } else if (inq.ip !== filters.ip) return false;
  }
  if (filters.status && inq.status !== filters.status) return false;
  if (filters.inquiryType) {
    const want = filters.inquiryType.toLowerCase();
    const got = (inq.inquiryType ?? '').toLowerCase();
    if (!got.includes(want)) return false;
  }
  return true;
}
