import { router } from '../lib/trpc.js';
import { chatRouter } from './chat.js';
import { propertiesRouter } from './properties.js';
import { seoRouter } from './seo.js';
import { funnelRouter } from './funnel.js';

export const appRouter = router({
  chat: chatRouter,
  properties: propertiesRouter,
  seo: seoRouter,
  funnel: funnelRouter,
});

export type AppRouter = typeof appRouter;
