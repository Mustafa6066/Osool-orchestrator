/**
 * Skills Loader — loads enabled skills for a given agent from the DB,
 * with a 5-minute Redis cache to avoid per-request DB hits.
 *
 * Usage:
 *   const skills = await loadSkillsFor('chat-agent');
 *   // Merge skills into system prompt and tools array
 */

import { db } from '@osool/db';
import { skills } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string | null;
  targetAgents: string[];
  config: Record<string, unknown>;
  promptFragment: string | null;
  toolsJson: Array<{
    name: string;
    description: string;
    input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  }> | null;
}

const CACHE_TTL = 5 * 60; // 5 minutes

/**
 * Load all enabled skills for the given agent name.
 * Results are cached in Redis for 5 minutes.
 */
export async function loadSkillsFor(agentName: string): Promise<Skill[]> {
  const redis = getRedis();
  const cacheKey = `skills:agent:${agentName}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as Skill[];
  }

  // Drizzle doesn't support array containment with jsonb[] natively,
  // so we fetch all enabled skills and filter in JS.
  // In production with many skills, add a GIN index on target_agents.
  const allEnabled = await db
    .select()
    .from(skills)
    .where(eq(skills.enabled, true));

  const agentSkills: Skill[] = allEnabled
    .filter((s) => {
      const targets = (s.targetAgents as string[]) ?? [];
      return targets.includes(agentName) || targets.includes('*');
    })
    .map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      description: s.description,
      targetAgents: (s.targetAgents as string[]) ?? [],
      config: (s.config as Record<string, unknown>) ?? {},
      promptFragment: s.promptFragment,
      toolsJson: s.toolsJson as Skill['toolsJson'],
    }));

  await redis.set(cacheKey, JSON.stringify(agentSkills), 'EX', CACHE_TTL);
  return agentSkills;
}

/**
 * Invalidate the skills cache for a specific agent (or all agents if none specified).
 * Called when a skill is toggled via the admin API.
 */
export async function invalidateSkillsCache(agentName?: string): Promise<void> {
  const redis = getRedis();
  if (agentName) {
    await redis.del(`skills:agent:${agentName}`);
  } else {
    // Flush all skills caches
    const keys = await redis.keys('skills:agent:*');
    if (keys.length > 0) await redis.del(...keys);
  }
}

/**
 * Compose skill prompt fragments into a single string suitable for
 * appending to an agent's system prompt.
 */
export function composeSkillPrompt(skills: Skill[]): string {
  const fragments = skills
    .map((s) => s.promptFragment)
    .filter((f): f is string => !!f && f.trim().length > 0);

  if (fragments.length === 0) return '';
  return '\n\n---\n## Active Capabilities\n\n' + fragments.join('\n\n');
}

/**
 * Collect all tool definitions from skills, deduplicated by tool name.
 */
export function composeSkillTools(skills: Skill[]): Skill['toolsJson'] {
  const seen = new Set<string>();
  const tools: NonNullable<Skill['toolsJson']> = [];

  for (const skill of skills) {
    if (!skill.toolsJson) continue;
    for (const tool of skill.toolsJson) {
      if (!seen.has(tool.name)) {
        seen.add(tool.name);
        tools.push(tool);
      }
    }
  }

  return tools.length > 0 ? tools : null;
}
