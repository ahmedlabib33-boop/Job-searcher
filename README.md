# Cairo Job Finder

A web app that searches several job sources at once and shows on-site and remote jobs for people in Greater Cairo, in one list.

- **Search** by job title, skill or company, in an area of Cairo (New Cairo, Nasr City, Maadi, Heliopolis, 6th of October, Sheikh Zayed, Smart Village, the New Capital and more).
- **Filter** by work mode (on-site / remote), job type (full-time, part-time, contract, internship) and how recently the job was posted.
- **Save** jobs to come back to (stored in your browser).
- **Apply** links go straight to the original posting.
- Works on phones and desktops, in light and dark mode. Arabic job titles and descriptions display correctly.

## Where the jobs come from

Every search runs on all connected sources at the same time. Results are merged, duplicates are removed, and the newest jobs come first.

### Remote jobs (work without a key)

| Source | What it adds |
| --- | --- |
| [Himalayas](https://himalayas.app/api) | Remote jobs whose employers accept people based in Egypt |
| [We Work Remotely](https://weworkremotely.com) | Remote jobs open to people anywhere in the world |
| [Remote OK](https://remoteok.com/api) | Remote jobs, mostly in tech, open to Egypt or with no location limit |
| [Jobicy](https://jobi.cy/apidocs) | Remote jobs that can be done from anywhere |

### On-site jobs in Cairo (each needs a free key)

| Source | What it adds | Free plan |
| --- | --- | --- |
| [JSearch](https://www.openwebninja.com/api/jsearch) | Google for Jobs: LinkedIn, Indeed, Wuzzuf, Bayt and company career pages | Limited requests per month |
| [SerpApi](https://serpapi.com/google-jobs-api) | A second route to Google Jobs, which adds Glassdoor and more | 250 searches a month |
| [Careerjet](https://www.careerjet.com.eg) | Jobs collected from Egyptian job boards and company sites | Free partner account |
| [Jooble](https://eg.jooble.org) | Jobs collected from many Egyptian and international job sites | 500 requests in total |

Without any of these keys the app still works, but shows **remote jobs only**. The more keys you add, the more Cairo jobs you'll see. The **Sources** tab in the app shows what's connected.

### Why not connect to LinkedIn, Wuzzuf, Indeed and Bayt directly?

They don't offer a public way for other apps to read their jobs, they block automated tools, and their terms forbid copying their listings. Their jobs still reach this app through Google for Jobs (JSearch and SerpApi) and through job aggregators (Careerjet and Jooble). Each job shows where it was originally posted, for example "via LinkedIn · found by JSearch".

## Run it

You need [Node.js](https://nodejs.org) 22.9 or newer.

```bash
npm install
cp .env.example .env    # then add your keys (optional)
npm start
```

Open http://localhost:3000.

`npm run dev` does the same, and restarts the server when you change a file.

## Connect the on-site sources

Put each key in your `.env` file, then restart the app. You can add one, some or all of them.

**JSearch:** `JSEARCH_API_KEY`
1. Create a free account on [RapidAPI](https://rapidapi.com) and open the [JSearch API page](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch).
2. Subscribe to the free **Basic** plan and copy your `X-RapidAPI-Key`.
3. If your key comes directly from [OpenWeb Ninja](https://www.openwebninja.com/api/jsearch) instead, also set `JSEARCH_PROVIDER=openwebninja`.

**SerpApi:** `SERPAPI_API_KEY`
1. [Sign up](https://serpapi.com/users/sign_up) for the free plan.
2. Copy your API key from your SerpApi dashboard.

**Careerjet:** `CAREERJET_API_KEY`
1. Create a publisher (partner) account at [careerjet.com.eg/partners](https://www.careerjet.com.eg/partners/).
2. Add your website and copy the API key Careerjet gives you for it.
3. The app asks for Careerjet's Egypt site with `CAREERJET_LOCALE=en_EG`. If Careerjet shows "Unsupported locale code", ask Careerjet for the right code and set it in `.env`.

**Jooble:** `JOOBLE_API_KEY`
1. Request a key on the **Egypt** site, [eg.jooble.org/api/about](https://eg.jooble.org/api/about). Jooble keys only work for the country they were made on.
2. A free Jooble key allows **500 requests in total**, not per month. The app keeps Jooble results for 24 hours to make them last.

To save your free quotas, the app reuses results instead of asking again: Google-based sources for 6 hours, Careerjet for 3 hours, Jooble for 24 hours and the remote feeds for 1 hour.

### What has been tested

The four free remote sources were tested against the real services. JSearch, SerpApi, Careerjet and Jooble were built from their official documentation and tested with sample data, but not yet with real keys. If one of them shows "unavailable" in the results bar after you add its key, the message next to it says why (for example "API key was rejected").

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
  http.js             JSON and RSS fetching with timeouts, and error messages safe to show users
  util.js             HTML-to-text, RSS reading, salary, date, location and URL helpers
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
  signupUrl: 'https://mysource.example/api', // where to get a key (optional)
  isConfigured: (env) => Boolean(env.MYSOURCE_API_KEY),

  // params: { q, area, mode, type, posted, page }
  // ctx:    { env, fetchJson, fetchText, cached, now, client }
  async search(params, ctx) {
    return { jobs: [/* normalized jobs */], hasMore: false };
  },
};
```

Each job needs `id`, `title`, `company`, `location`, `remote`, `type`, `postedAt`, `url` and `source`. The existing providers are good examples.

## Rules of the sources

Each source lets apps show its jobs as long as the app follows a few rules:

- Credit the source with a link. Every job card shows "via Himalayas", "via Remote OK" and so on.
- Send people to the source's own apply link, unchanged.
- Hide expired jobs.
- Don't poll more often than needed. Results are cached.
- Don't pass the jobs on to other job boards or aggregators.
- Careerjet also needs each visitor's IP address and browser with every search, so the app passes them along. It doesn't store them.

Read each source's terms before you publish the app for other people: [Himalayas](https://himalayas.app/api), [Jobicy](https://jobi.cy/apidocs), [Remote OK](https://remoteok.com/api), [Careerjet](https://www.careerjet.com/partners/api/), [Jooble](https://help.jooble.org/en/support/solutions/articles/60001448238-rest-api-documentation) and [SerpApi](https://serpapi.com/legal).
