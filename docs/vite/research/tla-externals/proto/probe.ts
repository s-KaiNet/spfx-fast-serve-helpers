// Loaded after the web part entry (TLA_PROBE=1). Exercises: a pre-bundled dep that imports sp-*,
// a package not imported by src (sp-http), dynamic import of an SPFx library, and an HMR target.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { fakeDep, evaluatedAt } from 'fake-spfx-dep';
import ProbeCounter from './ProbeCounter';

export async function run(): Promise<unknown> {
  const w = window as any;
  const r: any = { fakeEvaluatedAt: Math.round(evaluatedAt) };
  const f = fakeDep();
  r.fake = { version: f.version, cycle: f.cycle, http: typeof f.SPHttpClient };
  w.__tlaFake = f;
  const t0 = performance.now();
  const pp = await import('@microsoft/sp-property-pane');
  r.dynamicPropertyPaneMs = Math.round(performance.now() - t0);
  w.__tlaPP = pp;
  const t1 = performance.now();
  try {
    const dyn = await import('@microsoft/sp-dynamic-data');
    w.__tlaDyn = dyn;
    r.dynamicDynamicDataMs = Math.round(performance.now() - t1);
  } catch (e) { r.dynamicDynamicDataError = String(e); }
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:#ff0';
  document.body.appendChild(host);
  createRoot(host).render(React.createElement(ProbeCounter));
  return r;
}
