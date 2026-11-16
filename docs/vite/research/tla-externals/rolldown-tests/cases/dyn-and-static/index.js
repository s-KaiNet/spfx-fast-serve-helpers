import { http } from './http.js';
export async function result() { const m = await import('./lazy.js'); return http() + '|' + m.lazy(); }
