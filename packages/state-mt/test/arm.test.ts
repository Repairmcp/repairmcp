import { describe, expect, test } from 'bun:test';
import type { CaptureIo } from '@repairmcp/state-law';
import { captureArm } from '../src/capture-arm.js';
import { parseArmDocument } from '../src/parse-arm.js';
import type { ArmCaptureSource } from '../src/sources-arm.js';

/**
 * Fixtures mirror the live rules.mt.gov policy-library-public API, verified
 * against raw responses 2026-08-27: the sections tree (childSections /
 * childPolicies), the policy detail (active version with ISO
 * effectiveStartDate, history field, ACCESSIBLE_HTML contentUrl + SHA-256
 * contentHash), and the document HTML (div#documentBody, first paragraph
 * carrying the citation-id span + ALL-CAPS name). The API's contentHash was
 * verified to equal sha256 over the fetched document bytes, so the capture
 * recomputes and compares — the truncation guard.
 */

const DOC_HTML = `<html><head><style>#documentBody { padding: 2.5rem; }</style></head>
<body style="font-family:Calibri">
<div id="documentBody">
<div>
<p style="margin-top:12pt"><strong><span uuid="u-1701" citation-id="6.6.1701">6.6.1701</span> GENERAL BUSINESS PRACTICE OR GENERAL COURSE OF BUSINESS PRACTICE </strong></p>
<p style="margin-top:0pt"><span style="-aw-import:ignore">&nbsp;</span></p>
<p style="margin-left:57.6pt">(1) General business practice or general course of business practice means conduct occurring with a frequency that indicates a pattern.</p>
<p style="margin-left:57.6pt">(2) This rule applies under Chapter 300, Laws of 1983 and <a href="x">33-18-201</a>, MCA.</p>
</div>
</div>
</body></html>`;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const DOC_HASH = await sha256Hex(DOC_HTML);

const TREE: Record<string, unknown> = {
  root: {
    category: 'COLLECTION',
    childPolicies: [],
    childSections: [
      { sectionId: '6', sectionType: 'Title', name: 'STATE AUDITOR', uuid: 'u-t6', effectiveStatus: 'EFFECTIVE' },
    ],
  },
  'u-t6': {
    childPolicies: [],
    childSections: [
      { sectionId: '6.6', sectionType: 'Chapter', name: 'INSURANCE DEPARTMENT', uuid: 'u-c66', effectiveStatus: 'EFFECTIVE' },
    ],
  },
  'u-c66': {
    childPolicies: [],
    childSections: [
      { sectionId: '6.6.17', sectionType: 'Subchapter', name: 'Unfair Trade Practices', uuid: 'u-s6617', effectiveStatus: 'EFFECTIVE' },
    ],
  },
  'u-s6617': {
    childPolicies: [
      { sectionId: '6.6.1701', name: 'GENERAL BUSINESS PRACTICE OR GENERAL COURSE OF BUSINESS PRACTICE', uuid: 'u-1701', effectiveStatus: 'EFFECTIVE' },
      { sectionId: '6.6.1702', name: 'OLD RULE', uuid: 'u-1702', effectiveStatus: 'REPEALED' },
    ],
    childSections: [],
  },
};

const DETAIL_1701 = {
  policy: {
    citationId: '6.6.1701',
    effectiveStatus: 'EFFECTIVE',
    name: 'GENERAL BUSINESS PRACTICE OR GENERAL COURSE OF BUSINESS PRACTICE',
    uuid: 'u-1701',
    policyVersions: [
      {
        isActive: true,
        effectiveStartDate: '1983-10-28',
        accessibleHtmlDocument: {
          contentHashSha256: DOC_HASH,
          contentType: 'text/html',
          contentUrl: '/api/policy-library-public/collections/c-arm/policies/u-1701/document/d-1',
        },
        fields: [
          { key: 'history', label: 'Rule History', type: 'STRING', value: 'NEW, 1983 MAR p. 1533, Eff. 10/28/83.' },
        ],
      },
    ],
  },
};

interface FakeIoLog {
  jsonUrls: string[];
  textUrls: string[];
}

function fakeIo(overrides: { detailHash?: string } = {}): { io: CaptureIo; log: FakeIoLog } {
  const log: FakeIoLog = { jsonUrls: [], textUrls: [] };
  const detail = overrides.detailHash
    ? {
        policy: {
          ...DETAIL_1701.policy,
          policyVersions: [
            {
              ...DETAIL_1701.policy.policyVersions[0]!,
              accessibleHtmlDocument: {
                ...DETAIL_1701.policy.policyVersions[0]!.accessibleHtmlDocument,
                contentHashSha256: overrides.detailHash,
              },
            },
          ],
        },
      }
    : DETAIL_1701;
  const io: CaptureIo = {
    async fetchJson<T>(url: string): Promise<T> {
      log.jsonUrls.push(url);
      if (url.endsWith('/collections')) {
        // Real shape verified 2026-08-27: { collections: [{ name, uuid, … }] }
        return { collections: [{ name: 'Administrative Rules of Montana', uuid: 'c-arm' }] } as T;
      }
      if (url.endsWith('/sections')) return TREE.root as T;
      const sectionMatch = /\/sections\/([^/]+)$/.exec(url);
      if (sectionMatch) return TREE[sectionMatch[1]!] as T;
      if (url.includes('/policies/u-1701')) return detail as T;
      throw new Error(`fake io: no JSON fixture for ${url}`);
    },
    async fetchText(url: string): Promise<string> {
      log.textUrls.push(url);
      if (url.includes('/document/d-1')) return DOC_HTML;
      throw new Error(`fake io: no text fixture for ${url}`);
    },
    log: () => {},
  };
  return { io, log };
}

const SUBCHAPTER_SOURCE: ArmCaptureSource = {
  code: 'ARM',
  subchapterId: '6.6.17',
  chapterKey: '6.6',
  chapterTitle: 'Insurance Department',
  domain: 'insurance',
  filter: { kind: 'subchapter' },
};

describe('parseArmDocument', () => {
  test('extracts verbatim paragraphs, skipping the nbsp spacers', () => {
    const parsed = parseArmDocument(DOC_HTML, { expectedCite: '6.6.1701' });
    const lines = parsed.text.split('\n');
    expect(lines[0]).toBe(
      '6.6.1701 GENERAL BUSINESS PRACTICE OR GENERAL COURSE OF BUSINESS PRACTICE',
    );
    expect(lines[1]).toContain('(1) General business practice');
    expect(lines[2]).toContain('33-18-201, MCA');
    expect(lines).toHaveLength(3);
  });

  test('the citation-id cross-check throws on a mismatch', () => {
    expect(() => parseArmDocument(DOC_HTML, { expectedCite: '6.6.9999' })).toThrow(/6\.6\.9999/);
  });
});

describe('captureArm', () => {
  test('walks the tree, captures effective rules verbatim with dates and hashes', async () => {
    const { io } = fakeIo();
    const result = await captureArm(io, [SUBCHAPTER_SOURCE], {});
    expect(result.sections).toHaveLength(1);
    const section = result.sections[0]!;
    expect(section.cite).toBe('6.6.1701');
    expect(section.code).toBe('ARM');
    expect(section.chapter).toBe('6.6');
    expect(section.effectiveDate).toBe('1983-10-28');
    expect(section.historyNote).toBe('NEW, 1983 MAR p. 1533, Eff. 10/28/83.');
    expect(section.sourceHash).toBe(DOC_HASH);
    expect(section.text).toContain('GENERAL BUSINESS PRACTICE');
    // The repealed sibling is skipped and reported, not captured.
    expect(result.report.skippedEmpty).toEqual(['6.6.1702']);
  });

  test('a hash mismatch hard-fails — the truncation guard', async () => {
    const { io } = fakeIo({ detailHash: 'f'.repeat(64) });
    await expect(captureArm(io, [SUBCHAPTER_SOURCE], {})).rejects.toThrow(/hash/i);
  });

  test('a previous section with the same hash skips the document fetch', async () => {
    const { io, log } = fakeIo();
    const previous = (await captureArm(fakeIo().io, [SUBCHAPTER_SOURCE], {})).sections;
    const result = await captureArm(io, [SUBCHAPTER_SOURCE], { previousSections: previous });
    expect(result.sections[0]!.text).toBe(previous[0]!.text);
    expect(log.textUrls).toHaveLength(0);
  });

  test('a by-name rule that is missing or not effective hard-fails', async () => {
    const missing: ArmCaptureSource = {
      ...SUBCHAPTER_SOURCE,
      filter: { kind: 'rules', ruleIds: ['6.6.9999'] },
    };
    await expect(captureArm(fakeIo().io, [missing], {})).rejects.toThrow(/6\.6\.9999/);
    const repealed: ArmCaptureSource = {
      ...SUBCHAPTER_SOURCE,
      filter: { kind: 'rules', ruleIds: ['6.6.1702'] },
    };
    await expect(captureArm(fakeIo().io, [repealed], {})).rejects.toThrow(/6\.6\.1702/);
  });
});
