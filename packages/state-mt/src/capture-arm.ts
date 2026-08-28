/**
 * The ARM capture pipeline: resolve the ARM collection, walk the
 * Title→Chapter→Subchapter tree to each manifest subchapter, fetch each
 * rule's detail and its ACCESSIBLE_HTML document, and hard-verify the API's
 * own SHA-256 content hash against the fetched bytes (the truncation
 * guard). A previous section carrying the same hash skips the document
 * fetch entirely — the drift checker's shortcut.
 */
import type { CaptureIo } from '@repairmcp/state-law';
import { parseArmDocument } from './parse-arm.js';
import type { MtSection } from './schema.js';
import type { ArmCaptureSource } from './sources-arm.js';

const ARM_API_BASE = 'https://rules.mt.gov/api/policy-library-public';
const ARM_SITE_BASE = 'https://rules.mt.gov';

interface TreeChild {
  sectionId?: string;
  name?: string;
  uuid: string;
  effectiveStatus?: string;
}

interface TreeNode {
  childSections?: TreeChild[];
  childPolicies?: TreeChild[];
}

interface PolicyDetail {
  policy: {
    citationId: string;
    effectiveStatus?: string;
    name: string;
    uuid: string;
    policyVersions: Array<{
      isActive?: boolean;
      effectiveStartDate?: string;
      accessibleHtmlDocument?: { contentHashSha256?: string; contentUrl?: string };
      fields?: Array<{ key?: string; value?: string }>;
    }>;
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ArmCaptureResult {
  sections: MtSection[];
  report: { skippedEmpty: string[]; warnings: string[] };
}

export async function captureArm(
  io: CaptureIo,
  sources: readonly ArmCaptureSource[],
  opts: { previousSections?: readonly MtSection[] },
): Promise<ArmCaptureResult> {
  const previousByCite = new Map(
    (opts.previousSections ?? [])
      .filter((s) => s.code === 'ARM')
      .map((s) => [s.cite, s]),
  );

  const collectionsResponse = await io.fetchJson<{ collections?: TreeChild[] }>(
    `${ARM_API_BASE}/collections`,
    { rawName: 'arm-collections.json' },
  );
  const collection = (collectionsResponse.collections ?? []).find(
    (c) => c.name === 'Administrative Rules of Montana',
  );
  if (!collection) {
    throw new Error('ARM collection not found in the policy-library API — API drift.');
  }
  const base = `${ARM_API_BASE}/collections/${collection.uuid}`;

  const nodeCache = new Map<string, TreeNode>();
  async function children(uuid?: string): Promise<TreeNode> {
    const key = uuid ?? 'root';
    const cached = nodeCache.get(key);
    if (cached) return cached;
    const url = uuid ? `${base}/sections/${uuid}` : `${base}/sections`;
    const node = await io.fetchJson<TreeNode>(url, { rawName: `arm-sections-${key}.json` });
    nodeCache.set(key, node);
    return node;
  }

  /** Walk sectionId path segments: '6.6.17' visits '6' → '6.6' → '6.6.17'. */
  async function resolveSubchapter(subchapterId: string): Promise<TreeNode> {
    const parts = subchapterId.split('.');
    const path = parts.map((_, i) => parts.slice(0, i + 1).join('.'));
    let node = await children();
    let at = 'root';
    for (const sectionId of path) {
      const child = (node.childSections ?? []).find((c) => c.sectionId === sectionId);
      if (!child) {
        throw new Error(`ARM tree: ${sectionId} not found under ${at} — renumbered or API drift.`);
      }
      node = await children(child.uuid);
      at = sectionId;
    }
    return node;
  }

  const sections: MtSection[] = [];
  const skippedEmpty: string[] = [];
  const warnings: string[] = [];

  for (const source of sources) {
    const subchapter = await resolveSubchapter(source.subchapterId);
    const policies = subchapter.childPolicies ?? [];

    let wanted: TreeChild[];
    if (source.filter.kind === 'subchapter') {
      wanted = policies.filter((p) => {
        if (p.effectiveStatus === 'EFFECTIVE') return true;
        if (p.sectionId) skippedEmpty.push(p.sectionId);
        return false;
      });
    } else {
      wanted = source.filter.ruleIds.map((ruleId) => {
        const policy = policies.find((p) => p.sectionId === ruleId);
        if (!policy || policy.effectiveStatus !== 'EFFECTIVE') {
          throw new Error(
            `ARM rule ${ruleId} was requested by name but is ${policy ? `status ${policy.effectiveStatus}` : 'absent'} in ${source.subchapterId}.`,
          );
        }
        return policy;
      });
    }

    for (const policyRef of wanted) {
      const detail = await io.fetchJson<PolicyDetail>(`${base}/policies/${policyRef.uuid}`, {
        rawName: `arm-policy-${policyRef.sectionId}.json`,
      });
      const policy = detail.policy;
      const active = policy.policyVersions.find((v) => v.isActive) ?? policy.policyVersions[0];
      const doc = active?.accessibleHtmlDocument;
      if (!active || !doc?.contentUrl || !doc.contentHashSha256) {
        throw new Error(`ARM rule ${policy.citationId}: no active ACCESSIBLE_HTML document.`);
      }
      const historyNote = active.fields?.find((f) => f.key === 'history')?.value;
      const effectiveDate = active.effectiveStartDate?.slice(0, 10);

      let text: string;
      const previous = previousByCite.get(policy.citationId);
      if (previous?.sourceHash === doc.contentHashSha256) {
        // Content-addressed shortcut: the API's hash says the document is
        // unchanged, so the served text is already exact.
        text = previous.text;
      } else {
        const documentHtml = await io.fetchText(`${ARM_SITE_BASE}${doc.contentUrl}`, {
          rawName: `arm-doc-${policy.citationId}.html`,
        });
        const computed = await sha256Hex(documentHtml);
        if (computed !== doc.contentHashSha256) {
          throw new Error(
            `ARM rule ${policy.citationId}: fetched document hash ${computed.slice(0, 12)}… does not ` +
              `match the API's contentHash ${doc.contentHashSha256.slice(0, 12)}… — truncated or altered in flight.`,
          );
        }
        text = parseArmDocument(documentHtml, { expectedCite: policy.citationId }).text;
      }

      sections.push({
        cite: policy.citationId,
        code: 'ARM',
        chapter: source.chapterKey,
        chapterTitle: source.chapterTitle,
        heading: policy.name,
        text,
        ...(effectiveDate ? { effectiveDate } : {}),
        ...(historyNote ? { historyNote } : {}),
        domain: source.domain,
        sourceUrl: `${ARM_SITE_BASE}/browse/collections/${collection.uuid}/policies/${policy.uuid}`,
        sourceHash: doc.contentHashSha256,
      });
    }
  }

  return { sections, report: { skippedEmpty, warnings } };
}
