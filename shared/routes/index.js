import { createRegistry } from '../engine.js';
import { register as auth } from './auth.js';
import { register as directory } from './directory.js';
import { register as queue } from './queue.js';
import { register as visits } from './visits.js';
import { register as pharmacy } from './pharmacy.js';
import { register as labs } from './labs.js';
import { register as billing } from './billing.js';
import { register as wards } from './wards.js';
import { register as insight } from './insight.js';

const registry = createRegistry();
// order matters: literal paths must be registered before ':id' patterns
for (const mod of [auth, directory, queue, visits, pharmacy, labs, billing, wards, insight]) mod(registry.add);

export const ROUTES = registry.routes;
