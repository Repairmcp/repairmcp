import { z } from 'zod';
import type { ToolRegistrar } from '@repairmcp/core';
import type { DEGAdapter } from './adapter.js';

/**
 * DEG-specific replacement for the baseline `deg_find_supporting` tool.
 * Calls `DEGAdapter.findSupporting` (bigram + unigram + IP/vehicle/operation/recency
 * scoring) and exposes the per-component breakdown so the AI can interpret
 * confidence.
 *
 * Use with `RepairMCPServer.registerStandardTools({ skip: ['find_supporting'] })`
 * followed by `.registerCustomTool(buildDegFindSupportingTool(adapter))`.
 */
export function buildDegFindSupportingTool(adapter: DEGAdapter): ToolRegistrar {
  const description = `Find DEG inquiries that support charging or denying a specific labor / line-item operation.

USE THIS WHEN:
- Writing a supplement and you need DEG citations to justify a line item.
- An insurer denied an operation and you need precedent.
- Wondering if "not-included" status has been challenged on a similar operation.
- A line item appears on an estimate and you want to verify whether it's established practice in DEG resolutions.

INPUT: \`lineItemText\` in plain language (e.g. "R&I rear bumper for refinish on adjacent panel"); optional \`vehicleYear\` / \`vehicleMake\` / \`vehicleModel\` filters.

OUTPUT: Ranked list of supporting inquiries with \`confidence\` scores (0–1) and ready-to-cite citations. Each result includes a \`breakdown\` exposing how the confidence was assembled (bigram/unigram/IP/vehicle/operation/recency components). Use \`citation.shortForm\` verbatim when referencing in your response (e.g. "DEG #14732 (3/14/2025)"). Confidence above 0.7 indicates a strong textual + contextual match; 0.4–0.7 is a likely-relevant precedent worth reading; below 0.4 is a weak link — cite cautiously.`;

  return (server) => {
    server.registerTool(
      'deg_find_supporting',
      {
        title: 'Find supporting DEG inquiries',
        description,
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
