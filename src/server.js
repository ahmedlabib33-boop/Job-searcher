import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { AREAS } from './areas.js';
import { TtlCache } from './cache.js';
import { fetchJson as defaultFetchJson, fetchText as defaultFetchText } from './http.js';
import { parseSearchParams } from './params.js';
import { PROVIDERS } from './providers/index.js';
import { describeSource, searchJobs } from './search.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

export function createApp({
  providers = PROVIDERS,
  env = process.env,
  fetchJson = defaultFetchJson,
  fetchText = defaultFetchText,
  cache = new TtlCache(),
  now = Date.now,
  log = console.warn,
} = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; " +
        "connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
  });

  app.get('/api/meta', (req, res) => {
    res.json({ areas: AREAS, sources: providers.map((provider) => describeSource(provider, env)) });
  });

  app.get('/api/search', async (req, res) => {
    const params = parseSearchParams(req.query);
    const client = { ip: req.ip, userAgent: req.get('user-agent'), referer: req.get('referer') };
    const result = await searchJobs(params, { providers, env, fetchJson, fetchText, cache, now, log, client });
    res.set('Cache-Control', 'no-store');
    res.json({ params, ...result });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(publicDir));

  app.use((error, req, res, next) => {
    log(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`Cairo Job Finder is running at http://localhost:${port}`);
    const connected = PROVIDERS.filter((provider) => provider.isConfigured(process.env));
    console.log(`Connected sources: ${connected.map((provider) => provider.name).join(', ')}`);
    if (!connected.some((provider) => provider.modes.includes('onsite'))) {
      console.log('No on-site source has an API key yet, so only remote jobs are shown. See README.md to add one.');
    }
  });
}
