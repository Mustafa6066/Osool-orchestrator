/**
 * Skills admin routes — GET and PUT endpoints for the skills registry.
 *
 * GET  /admin/skills         — list all skills
 * GET  /admin/skills/:id     — get a single skill
 * PUT  /admin/skills/:id     — update (toggle enable/disable, edit config)
 * POST /admin/skills         — create a new skill
 */

import type { FastifyInstance } from 'fastify';
import { db } from '@osool/db';
import { skills } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { invalidateSkillsCache } from '../skills/loader.js';

const upsertSkillSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().default('1.0.0'),
  description: z.string().optional(),
  targetAgents: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
  promptFragment: z.string().optional(),
  toolsJson: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        input_schema: z.object({
          type: z.literal('object'),
          properties: z.record(z.unknown()),
          required: z.array(z.string()).optional(),
        }),
      }),
    )
    .optional(),
});

export async function registerSkillsRoutes(app: FastifyInstance): Promise<void> {
  // List all skills
  app.get('/admin/skills', async (_req, reply) => {
    const rows = await db.select().from(skills);
    return reply.send(rows);
  });

  // Get a single skill
  app.get<{ Params: { id: string } }>('/admin/skills/:id', async (req, reply) => {
    const [skill] = await db.select().from(skills).where(eq(skills.id, req.params.id));
    if (!skill) return reply.status(404).send({ error: 'Skill not found' });
    return reply.send(skill);
  });

  // Create a new skill
  app.post('/admin/skills', async (req, reply) => {
    const parsed = upsertSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid skill data', details: parsed.error.issues });
    }

    const [created] = await db
      .insert(skills)
      .values({
        ...parsed.data,
        targetAgents: parsed.data.targetAgents,
        config: parsed.data.config ?? {},
        toolsJson: parsed.data.toolsJson ?? null,
      })
      .returning();

    // Invalidate caches for all targeted agents
    await Promise.all(
      (parsed.data.targetAgents ?? []).map((agent) => invalidateSkillsCache(agent)),
    );

    return reply.status(201).send(created);
  });

  // Update / toggle a skill
  app.put<{ Params: { id: string } }>('/admin/skills/:id', async (req, reply) => {
    const parsed = upsertSkillSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid skill data', details: parsed.error.issues });
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    const [updated] = await db
      .update(skills)
      .set(updateData)
      .where(eq(skills.id, req.params.id))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Skill not found' });

    // Invalidate all skills caches (agent list may have changed)
    await invalidateSkillsCache();

    return reply.send(updated);
  });

  // Quick toggle endpoint
  app.post<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/admin/skills/:id/toggle',
    async (req, reply) => {
      const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
      if (!body.success) return reply.status(400).send({ error: 'Invalid body' });

      const [updated] = await db
        .update(skills)
        .set({ enabled: body.data.enabled, updatedAt: new Date() })
        .where(eq(skills.id, req.params.id))
        .returning();

      if (!updated) return reply.status(404).send({ error: 'Skill not found' });

      await invalidateSkillsCache();
      return reply.send(updated);
    },
  );
}
