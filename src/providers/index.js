import { careerjet } from './careerjet.js';
import { himalayas } from './himalayas.js';
import { jobicy } from './jobicy.js';
import { jooble } from './jooble.js';
import { jsearch } from './jsearch.js';
import { remoteok } from './remoteok.js';
import { serpapi } from './serpapi.js';
import { weworkremotely } from './weworkremotely.js';

// Order matters: when the same job appears in several sources, the first one wins.
export const PROVIDERS = [jsearch, serpapi, careerjet, jooble, himalayas, weworkremotely, remoteok, jobicy];
