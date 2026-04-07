/**
 * score-experiment.job.ts
 *
 * Scores marketing experiments using bootstrap CI + Mann-Whitney U tests.
 * Groups data points by variant, checks min samples, then runs statistical analysis.
 * Auto-promotes winners to playbook.
 */

import { db } from '@osool/db';
import { experiments } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { scoreExperiment } from '@osool/shared';
import type { ExperimentScoringJobData } from '../queue.js';

export async function scoreExperimentJob(
  data: ExperimentScoringJobData,
): Promise<{ scored: number; winners: number }> {
  let experimentRows;

  if (data.experimentId) {
    experimentRows = await db
      .select()
      .from(experiments)
      .where(eq(experiments.id, data.experimentId));
  } else {
    // Score all running experiments
    experimentRows = await db
      .select()
      .from(experiments)
      .where(eq(experiments.status, 'running'));
  }

  let scored = 0;
  let winners = 0;

  for (const exp of experimentRows) {
    const dataPoints = (exp.dataPoints ?? []) as {
      variant: string;
      metric: string;
      value: number;
      ts: string;
    }[];

    const variants = (exp.variants ?? []) as { name: string; config: Record<string, unknown> }[];

    if (variants.length < 2) continue;

    const baseline = exp.baselineVariant ?? variants[0].name;
    const controlValues = dataPoints
      .filter((dp) => dp.variant === baseline && dp.metric === exp.primaryMetric)
      .map((dp) => dp.value);

    // Score each non-baseline variant against the baseline
    for (const variant of variants) {
      if (variant.name === baseline) continue;

      const treatmentValues = dataPoints
        .filter((dp) => dp.variant === variant.name && dp.metric === exp.primaryMetric)
        .map((dp) => dp.value);

      const result = scoreExperiment(controlValues, treatmentValues, variant.name, exp.minSamples);

      if (result.verdict !== 'running') {
        const updateData: Record<string, unknown> = {
          status: result.verdict,
          result: {
            pValue: result.pValue,
            liftPercent: result.liftPercent,
            liftCILower: result.liftCILower,
            liftCIUpper: result.liftCIUpper,
            mannWhitneyU: result.mannWhitneyU,
            significant: result.significant,
            scoredAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        };

        if (result.verdict === 'keep' && result.winner) {
          updateData.winner = result.winner;
          updateData.playbook = {
            variable: exp.variable,
            bestPractice: `Use variant "${result.winner}" — ${result.liftPercent.toFixed(1)}% lift`,
            liftPercent: result.liftPercent,
            confidence: 1 - result.pValue,
            adoptedAt: new Date().toISOString(),
          };
          winners++;
        }

        await db.update(experiments).set(updateData).where(eq(experiments.id, exp.id));
      }

      scored++;
    }
  }

  return { scored, winners };
}
