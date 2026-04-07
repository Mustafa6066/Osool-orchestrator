/**
 * Plugin Registry — bootstraps all domain plugins with the Consensus Router.
 *
 * Call `bootstrapPlugins()` once on server startup to register all domain
 * specialist agents. The routing plugin gets highest priority (1) since it
 * always activates and provides intent classification for other plugins.
 */

import { registerPlugin } from '../consensus-router.js';
import { ValuationPlugin } from '../plugins/valuation.plugin.js';
import { LegalPlugin } from '../plugins/legal.plugin.js';
import { MarketIntelPlugin } from '../plugins/market-intel.plugin.js';
import { PsychologyPlugin } from '../plugins/psychology.plugin.js';
import { ContentPlugin } from '../plugins/content.plugin.js';
import { RoutingPlugin } from '../plugins/routing.plugin.js';

let bootstrapped = false;

export function bootstrapPlugins(): void {
  if (bootstrapped) return;

  // Routing first (lowest priority number = highest priority) — zero-token classifier
  registerPlugin(new RoutingPlugin(), { priority: 1 });

  // Core domain specialists
  registerPlugin(new ValuationPlugin(), { priority: 5 });
  registerPlugin(new MarketIntelPlugin(), { priority: 5 });
  registerPlugin(new LegalPlugin(), { priority: 6 });

  // Engagement specialists
  registerPlugin(new PsychologyPlugin(), { priority: 7 });
  registerPlugin(new ContentPlugin(), { priority: 8 });

  bootstrapped = true;
}
