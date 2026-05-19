/**
 * @osool/reach — TypeScript port of Agent-Reach
 *
 * Provides multi-platform content access channels for the outreach agent.
 * Channels: RSS, web (Jina Reader), Twitter, YouTube, LinkedIn (public only).
 *
 * All channels implement the Channel interface defined in channels/base.ts.
 */

export type { Channel, ReachItem, ReachContent } from './channels/base.js';
export { RSSChannel } from './channels/rss.js';
export { WebChannel } from './channels/web.js';
export { TwitterChannel } from './channels/twitter.js';
export { YouTubeChannel } from './channels/youtube.js';
export { LinkedInChannel } from './channels/linkedin.js';
export { createReachManager, type ReachManager } from './manager.js';
