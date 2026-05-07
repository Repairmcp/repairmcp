import { z } from 'zod';
import {
  buildGetByIdTool,
  buildListRecentTool,
  buildSearchTool,
  type RepairMCPServer,
  type ToolRegistrar,
} from '@repairmcp/core';
import type { DEGAdapter } from './adapter.js';
import type { DEGInquiry } from './schema.js';

// ─────────────────────────────────────────────────────────────────────
// Tool descriptions — shop-floor language. The AI uses these for routing.
// Plain text only (markdown headers don't render uniformly across MCP clients).
// Each kept under 400 words.
// ─────────────────────────────────────────────────────────────────────

const DEG_SEARCH_DESCRIPTION = `Free-text search across the Database Enhancement Gateway (DEG) inquiry corpus — the industry's authoritative record of how labor times, included operations, and "not-included" items have been resolved across CCC, Mitchell, and Audatex.

USE THIS WHEN:
- A topic or operation comes up in conversation and you want a quick scan of what DEG has weighed in on (e.g. "blend time on two-tone panels", "weld-thru primer not-included", "frame measurement during blueprinting")
- You're triaging or exploring — looking for candidate inquiries to read in full afterward
- The user mentions an IP keyword like "P-pages", "MOTOR GTE", "Mitchell DBRM", or "Audatex Qapter" and wants to see related discussion
- You want to confirm an inquiry exists before pulling it by ID
- You are NOT writing a supplement or rebuttal right now — for that, use deg_find_supporting (which adds confidence scoring and vehicle/IP boosting tuned for line-item justification)

INPUT: A natural-language query in shop-floor terms ("R&I rear bumper for refinish on adjacent panel", "underhood lamp aim", "non-included weld-thru primer", "DRP estimate review on a frame pull"). Optional limit (default 10, max 50) and offset for pagination.

OUTPUT: Ranked list of matching inquiries, each with a relevance score (0–1), short snippet, and citation. Use citation.shortForm verbatim when referencing in generated text — e.g. "DEG #14732 (3/14/2025)" — never paraphrase, never reformat the date, never omit the # or parentheses. Follow up with deg_get_inquiry to pull the full text of any inquiry you want to quote in a supplement or rebuttal.`;

const DEG_GET_DESCRIPTION = `Fetch a single DEG inquiry by its ID, with the full issue summary, suggested action, and resolution text — plus a citation ready to drop into a supplement narrative or rebuttal letter.

USE THIS WHEN:
- A search result or find_supporting hit looks like a strong precedent and you need the complete text to quote in a supplement, short-pay rebuttal, or DRP estimate review
- You already have a DEG inquiry number in hand (from a previous conversation, an insurer reference, or a shop's running list of go-to citations) and need the content
- You need to verify an inquiry's status (resolved, pending, closed) and the IP's official response before citing — never cite a pending inquiry as established practice
- You need to confirm vehicle applicability (year/make/model/body) before applying an inquiry's resolution to your estimate — DEG resolutions are sometimes IP-or-platform-specific

INPUT: The inquiry id as a string, e.g. "40990" or "14732". DEG inquiry numbers are sequential integers; use them as-is.

OUTPUT: The complete inquiry record — issueSummary, suggestedAction, resolution, vehicle (year/make/model/body), inquiryType, areaOfVehicle, IP (CCC / Mitchell / Audatex / unknown), status, submitted/resolved dates — plus a citation. Use citation.shortForm verbatim when referencing in your response (e.g. "DEG #40990 (4/8/2026)") and citation.longForm when a full attribution sentence is needed at the end of a supplement document. If the inquiry is not found or has been removed from the public database, the response is { found: false, id }.`;

const DEG_LIST_RECENT_DESCRIPTION = `List the most recent DEG inquiries (newest first). DEG resolutions update the industry's understanding of database accuracy on a rolling basis — this tool surfaces what's new across CCC, Mitchell, and Audatex.

USE THIS WHEN:
- The user asks "what's new on DEG", "any recent rulings", or "did DEG resolve anything in the last quarter"
- You're catching up after a break and want to see fresh resolutions before going into estimate review or supplement work
- You're checking that a citation you'd planned to use hasn't been superseded by a newer inquiry — pair with deg_search_inquiries to spot related-but-newer precedent
- The shop is running an internal weekly DEG-updates briefing for estimators or DRP managers
- You want a baseline scan of "what has the IP changed lately" before committing to a supplement strategy

INPUT: Optional since (ISO 8601 date string — only items submitted at or after this point), optional limit (default 10, max 50). For weekly reviews, since is typically the previous Monday's date.

OUTPUT: Array of inquiries sorted newest first, each paired with its citation. Use citation.shortForm verbatim when summarizing for the user (e.g. "DEG #40990 (4/8/2026): blend time on two-tone refinish"). For the full text of any item you want to quote, follow up with deg_get_inquiry.`;

const DEG_FIND_SUPPORTING_DESCRIPTION = `Find DEG inquiries that support charging or denying a specific line item. THE killer tool for writing supplements, rebuttals to short-pays, and DRP estimate reviews. Runs DEG-specific scoring that combines bigram + unigram text match with vehicle, IP-keyword, operation-type, and recency boosts, and returns a confidence score 0–1 per result.

USE THIS WHEN:
- Writing a supplement and you need DEG precedent to justify a non-included or under-priced operation (e.g. blend time on adjacent two-tone panel, R&I for clear path to a damaged area, weld-thru primer, underhood lamp aim after R&I)
- Building a rebuttal to a short-pay or denial — the insurer cut a line and you need DEG resolutions establishing the operation as accepted practice
- During DRP estimate review when an item is called "non-included" and you want to confirm or refute that against industry consensus before agreeing
- Blueprinting an estimate and pre-checking whether each labor op is established in DEG before submitting — head off the short-pay before the insurer raises it
- Vetting whether a P-page / MOTOR GTE / DBRM omission has been raised before — include the IP keyword in the lineItemText and the tool will boost matching IPs

INPUT: lineItemText — natural shop-floor description of the operation in question. Real examples: "R&I rear bumper for refinish on adjacent panel", "weld-thru primer non-included", "underhood lamp aim after R&I", "frame measurement during blueprinting", "blend time on two-tone refinish". Optional: vehicleYear, vehicleMake, vehicleModel — adds a per-field +0.10 boost when the inquiry's vehicle matches (capped at +0.30). Optional: limit (1–20, default 5).

OUTPUT: Ranked supporting inquiries with confidence scores and citations. Each result includes a per-component breakdown (bigram, unigram, ip, vehicle, operation, recency) so you can interpret why a result ranked where it did.

CITATION DISCIPLINE — CRITICAL: Drop citation.shortForm verbatim into supplement narratives, rebuttal letters, and estimate notes. Format: "DEG #14732 (3/14/2025)". Never paraphrase, never reformat the date, never omit the # or parentheses — the citation is how the insurer's auditor cross-references back to the source DEG entry. For a full attribution sentence at the end of a supplement, use citation.longForm.

Confidence interpretation:
- > 0.7 — strong match; cite confidently in supplements/rebuttals.
- 0.4–0.7 — likely-relevant precedent; read the full inquiry via deg_get_inquiry before citing.
- < 0.4 — weak link; cite cautiously, only if no better precedent exists.`;

// ─────────────────────────────────────────────────────────────────────
// Builders — three are thin wrappers that override description; find_supporting
// is fully custom because of its scoring + breakdown payload.
// ─────────────────────────────────────────────────────────────────────

export function buildDegSearchInquiriesTool(adapter: DEGAdapter): ToolRegistrar {
  return buildSearchTool(adapter, { description: DEG_SEARCH_DESCRIPTION });
}

export function buildDegGetInquiryTool(adapter: DEGAdapter): ToolRegistrar {
  return buildGetByIdTool(adapter, { description: DEG_GET_DESCRIPTION });
}

export function buildDegListRecentTool(adapter: DEGAdapter): ToolRegistrar {
  return buildListRecentTool(adapter, { description: DEG_LIST_RECENT_DESCRIPTION });
}

export function buildDegFindSupportingTool(adapter: DEGAdapter): ToolRegistrar {
  return (server) => {
    server.registerTool(
      'deg_find_supporting',
      {
        title: 'Find supporting DEG inquiries',
        description: DEG_FIND_SUPPORTING_DESCRIPTION,
        inputSchema: {
          lineItemText: z
            .string()
            .min(1)
            .describe('The line item description in plain language.'),
          vehicleYear: z.number().int().optional(),
          vehicleMake: z.string().optional(),
          vehicleModel: z.string().optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .default(5)
            .describe('Max supporting inquiries to return (1–20).'),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args) => {
        const findOpts: Parameters<DEGAdapter['findSupporting']>[0] = {
          lineItemText: args.lineItemText,
          limit: args.limit ?? 5,
        };
        if (args.vehicleYear !== undefined) findOpts.vehicleYear = args.vehicleYear;
        if (args.vehicleMake) findOpts.vehicleMake = args.vehicleMake;
        if (args.vehicleModel) findOpts.vehicleModel = args.vehicleModel;

        const results = adapter.findSupporting(findOpts);
        const hits = results.map((r) => ({
          id: r.inquiry.id,
          title: r.inquiry.title,
          url: r.inquiry.url,
          confidence: Number(r.score.toFixed(3)),
          breakdown: {
            bigram: Number(r.breakdown.bigram.toFixed(3)),
            unigram: Number(r.breakdown.unigram.toFixed(3)),
            text: Number(r.breakdown.text.toFixed(3)),
            ip: r.breakdown.ip,
            vehicle: r.breakdown.vehicle,
            operation: r.breakdown.operation,
            recency: r.breakdown.recency,
          },
          inquiryType: r.inquiry.inquiryType,
          areaOfVehicle: r.inquiry.areaOfVehicle,
          ip: r.inquiry.ip,
          vehicle: {
            year: r.inquiry.vehicleYear,
            make: r.inquiry.vehicleMake,
            model: r.inquiry.vehicleModel,
          },
          snippet: r.snippet,
          citation: adapter.formatCitation(r.inquiry),
        }));
        const payload = { count: hits.length, results: hits };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        };
      },
    );
  };
}

/**
 * Convenience: register all four DEG tools (with shop-floor descriptions) on
 * a server. Replaces both the search/get/list_recent baselines (description
 * override only — schema and handler unchanged) and the find_supporting
 * baseline (full custom scoring + breakdown payload).
 */
export function registerDegTools(server: RepairMCPServer<DEGInquiry>, adapter: DEGAdapter): void {
  server.registerCustomTool(buildDegSearchInquiriesTool(adapter));
  server.registerCustomTool(buildDegGetInquiryTool(adapter));
  server.registerCustomTool(buildDegListRecentTool(adapter));
  server.registerCustomTool(buildDegFindSupportingTool(adapter));
}
