import { getRedis } from '../lib/redis.js';
import { loadSkillsFor, composeSkillPrompt, composeSkillTools, type Skill } from '../skills/loader.js';

export type AgentStatus = 'idle' | 'running' | 'error';

export interface ActiveSkills {
  systemPromptAdditions: string;
  toolAdditions: Skill['toolsJson'];
}

/**
 * Abstract base class for all Osool autonomous agents.
 * Provides Redis-backed logging, status tracking, and a typed run interface.
 */
export abstract class BaseAgent {
  abstract readonly name: string;

  protected async logToRedis(message: string): Promise<void> {
    const redis = getRedis();
    const key = `agent:${this.name}:logs`;
    const entry = JSON.stringify({ ts: new Date().toISOString(), message });
    // Ring buffer — keep last 100 log lines
    await redis.lpush(key, entry);
    await redis.ltrim(key, 0, 99);
    await redis.expire(key, 60 * 60 * 48); // 48h TTL
  }

  protected async setStatus(status: AgentStatus, extra?: Record<string, unknown>): Promise<void> {
    const redis = getRedis();
    const key = `agent:${this.name}:status`;
    await redis.hset(key, {
      status,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
    await redis.expire(key, 60 * 60 * 48);
  }

  async getStatus(): Promise<{
    name: string;
    status: AgentStatus;
    lastRun: string | null;
    nextRun: string | null;
    logs: { ts: string; message: string }[];
  }> {
    const redis = getRedis();
    const statusKey = `agent:${this.name}:status`;
    const logsKey = `agent:${this.name}:logs`;

    const [raw, rawLogs] = await Promise.all([
      redis.hgetall(statusKey),
      redis.lrange(logsKey, 0, 19),
    ]);

    const logs = rawLogs
      .map((l) => { try { return JSON.parse(l) as { ts: string; message: string }; } catch { return null; } })
      .filter((l): l is { ts: string; message: string } => l !== null);

    return {
      name: this.name,
      status: (raw.status as AgentStatus) ?? 'idle',
      lastRun: raw.lastRun ?? null,
      nextRun: raw.nextRun ?? null,
      logs,
    };
  }

  /**
   * Execute the agent's core logic. Subclasses must implement this.
   */
  abstract run(payload?: unknown): Promise<void>;

  /**
   * Load active skills for this agent and compose them into
   * system prompt additions and extra tool definitions.
   * Called once per execute() cycle.
   */
  protected async getActiveSkills(): Promise<ActiveSkills> {
    try {
      const skills = await loadSkillsFor(this.name);
      return {
        systemPromptAdditions: composeSkillPrompt(skills),
        toolAdditions: composeSkillTools(skills),
      };
    } catch {
      // Skills are a non-critical enhancement — never block the agent
      return { systemPromptAdditions: '', toolAdditions: null };
    }
  }

  /**
   * Public entrypoint — wraps run() with status bookkeeping and error logging.
   */
  async execute(payload?: unknown): Promise<void> {
    await this.setStatus('running', { lastRun: new Date().toISOString() });
    await this.logToRedis(`▶ ${this.name} starting`);
    try {
      await this.run(payload);
      await this.setStatus('idle', { lastRun: new Date().toISOString() });
      await this.logToRedis(`✓ ${this.name} completed`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.setStatus('error');
      await this.logToRedis(`✗ ${this.name} error: ${msg}`);
      throw err;
    }
  }
}
