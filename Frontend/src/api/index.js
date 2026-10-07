import { realApi } from './realApi';
import { createDemoApi } from './demoApi';

export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

// One interface, two implementations: the REST backend or the in-browser demo.
export const api = IS_DEMO ? createDemoApi() : realApi;
