# Cairo Job Finder

A web app that searches several job sources at once and shows on-site and remote jobs for people in Greater Cairo, in one list.

- **Search** by job title, skill or company, in an area of Cairo (New Cairo, Nasr City, Maadi, Heliopolis, 6th of October, Sheikh Zayed, Smart Village, the New Capital and more).
- **Filter** by work mode (on-site / remote), job type (full-time, part-time, contract, internship) and how recently the job was posted.
- **Save** jobs to come back to (stored in your browser).
- **Apply** links go straight to the original posting.
- Works on phones and desktops, in light and dark mode. Arabic job titles and descriptions display correctly.

## Where the jobs come from

| Source | What it adds | Needs a key? |
| --- | --- | --- |
| [JSearch](https://www.openwebninja.com/api/jsearch) | On-site jobs in Cairo, from LinkedIn, Indeed, Wuzzuf, Bayt and company career pages (through Google for Jobs) | Yes, free tier available |
| [Himalayas](https://himalayas.app/api) | Remote jobs whose employers accept people based in Egypt | No |
| [Jobicy](https://jobi.cy/apidocs) | Remote jobs that can be done from anywhere | No |

Without a JSearch key the app still works, but shows **remote jobs only**.

The app does not scrape job sites. Wuzzuf, LinkedIn, Indeed and Bayt don't offer public APIs and their terms forbid scraping, so their listings come in through JSearch instead.

## Run it

You need [Node.js](https://nodejs.org) 22.9 or newer.

```bash
npm install
cp .env.example .env    # then add your keys (optional)
npm start
```

Open http://localhost:3000.

`npm run dev` does the same, and restarts the server when you change a file.

### Add the JSearch key (for on-site Cairo jobs)

1. Create a free account on [RapidAPI](https://rapidapi.com) and open the [JSearch API page](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch).
2. Subscribe to the free **Basic** plan and copy your `X-RapidAPI-Key`.
3. Put it in `.env`:

   ```
   JSEARCH_API_KEY=your-key-here
   ```

4. Restart the app.

If you got your key directly from [OpenWeb Ninja](https://www.openwebninja.com/api/jsearch) instead, also set `JSEARCH_PROVIDER=openwebninja`.

The free plan includes a limited number of requests per month. To make that last, the app reuses each JSearch result for 6 hours. Repeating the same search, or several people running it, costs nothing extra in that time.

## Tests

```bash
npm test
```

The tests use Node's built-in test runner and never call the real job APIs.

## How it's built

There's no build step and the only dependency is Express.

```
src/
  server.js           Express app: /api/search, /api/meta, and the web page
  search.js           Queries every source in parallel, then filters, removes duplicates and sorts
  params.js           Validates search parameters
  areas.js            Areas of Greater Cairo and how each one is searched
  cache.js            In-memory cache, so the same search isn't re-sent to the APIs
  http.js             JSON fetching with timeouts, and error messages safe to show users
  util.js             HTML-to-text, salary formatting, date and URL helpers
  providers/          One file per job source
public/               The web page (plain HTML, CSS and JavaScript)
test/                 Tests
```

### Adding another job source

Create a file in `src/providers/` that exports an object like this, then add it to `src/providers/index.js`:

```js
export const mySource = {
  id: 'mysource',
  name: 'My Source',
  homepage: 'https://mysource.example',
  description: 'What kind of jobs it adds',
  modes: ['onsite', 'remote'],          // which work modes it can return
  setupHint: 'Add MYSOURCE_API_KEY to .env', // shown when isConfigured() is false
  isConfigured: (env) => Boolean(env.MYSOURCE_API_KEY),

  // params: { q, area, mode, type, posted, page }
  // ctx:    { env, fetchJson, cached, now }
  async search(params, ctx) {
    return { jobs: [/* normalized jobs */], hasMore: false };
  },
};
```

Each job needs `id`, `title`, `company`, `location`, `remote`, `type`, `postedAt`, `url` and `source`. The existing providers are good examples.

## Rules of the sources

Each source lets apps show its jobs as long as the app follows a few rules:

- Credit the source with a link. Every job card shows "via Himalayas", "via Jobicy" and so on.
- Send people to the source's own apply link, unchanged.
- Hide expired jobs.
- Don't poll more often than needed. Results are cached.
- Don't pass the jobs on to other job boards or aggregators.

Read [Himalayas' API terms](https://himalayas.app/api) and [Jobicy's](https://jobi.cy/apidocs) before you publish the app for other people.
