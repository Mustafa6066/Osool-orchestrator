/**
 * cro-audit.job.ts
 *
 * Runs CRO audit on a given URL and stores results in the croAudits table.
 */

import { db } from '@osool/db';
import { croAudits } from '@osool/db/schema';
import { auditPage } from '../../services/cro-audit.service.js';
import type { CROAuditJobData } from '../queue.js';

export async function runCROAudit(
  data: CROAuditJobData,
): Promise<{ score: number; fixCount: number }> {
  const { url, pageType } = data;

  const result = await auditPage(url, pageType);

  // Store in DB
  await db.insert(croAudits).values({
    url,
    pageType,
    overallScore: result.overallScore,
    dimensionScores: result.dimensionScores,
    findings: result.findings,
    fixes: result.fixes ?? [],
  });

  return {
    score: result.overallScore,
    fixCount: result.fixes?.length ?? 0,
  };
}
