import { himalayas } from './himalayas.js';
import { jobicy } from './jobicy.js';
import { jsearch } from './jsearch.js';

// Order matters: when the same job appears in several sources, the first one wins.
export const PROVIDERS = [jsearch, himalayas, jobicy];
