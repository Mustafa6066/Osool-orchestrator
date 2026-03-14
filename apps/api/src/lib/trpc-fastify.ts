import type { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { type AnyRouter } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

export interface CreateFastifyContextOptions {
  req: FastifyRequest;
  res: FastifyReply;
}

interface TRPCFastifyPluginOptions extends FastifyPluginOptions {
  prefix?: string;
  trpcOptions: {
    router: AnyRouter;
    createContext: (opts: CreateFastifyContextOptions) => Promise<unknown>;
  };
}

export async function fastifyTRPCPlugin(
  fastify: FastifyInstance,
  opts: TRPCFastifyPluginOptions,
) {
  const { router, createContext } = opts.trpcOptions;

  fastify.all('/*', async (req, reply) => {
    const url = new URL(req.url, `http://${req.hostname}`);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const response = await fetchRequestHandler({
      endpoint: opts.prefix ?? '/trpc',
      req: request,
      router,
      createContext: () => createContext({ req, res: reply }),
    });

    reply.status(response.status);
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });

    const body = await response.text();
    reply.send(body);
  });
}
