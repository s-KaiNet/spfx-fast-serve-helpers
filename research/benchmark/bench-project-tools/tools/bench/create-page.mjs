// Creates (or updates) SitePages/spfx-bench.aspx with both bench web parts, saved as a draft.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cdpConnect, openPage, sleep, ROOT, log } from './lib.mjs';

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const parts = ['src/webparts/benchTree/BenchTreeWebPart.manifest.json', 'src/webparts/benchPnp/BenchPnpWebPart.manifest.json'].map(read);
const canvas = parts.map((m, i) => {
  const instanceId = crypto.randomUUID();
  return {
    position: { zoneIndex: 1, sectionIndex: 1, controlIndex: i + 1, sectionFactor: 12, layoutIndex: 1 },
    controlType: 3, id: instanceId, webPartId: m.id, emphasis: {}, zoneGroupMetadata: { type: 0 }, addedFromPersistedData: true,
    webPartData: {
      id: m.id, instanceId, title: m.preconfiguredEntries[0].title.default, description: m.preconfiguredEntries[0].description.default,
      serverProcessedContent: { htmlStrings: {}, searchablePlainTexts: {}, imageSources: {}, links: {} },
      dataVersion: '1.0', properties: m.preconfiguredEntries[0].properties
    }
  };
});

const cdp = await cdpConnect();
const page = await openPage(cdp);
await page.send('Page.navigate', { url: 'https://mastaq.sharepoint.com/sites/dev/SitePages/Forms/AllPages.aspx' });
await sleep(6000);
const result = await page.eval(`(async () => {
  const site = '/sites/dev';
  const H = { accept: 'application/json;odata=verbose', 'content-type': 'application/json;odata=verbose' };
  const digest = (await (await fetch(site + '/_api/contextinfo', { method: 'POST', headers: H })).json()).d.GetContextWebInformation.FormDigestValue;
  const h = { ...H, 'X-RequestDigest': digest };
  const out = {};
  const find = async () => (await (await fetch(site + "/_api/sitepages/pages?$select=Id,FileName&$filter=FileName eq 'spfx-bench.aspx'", { headers: h })).json()).d.results;
  let list = await find();
  if (${process.env.RECREATE === '1'}) list = [];
  if (!list.length) {
    // remove a non-site-page file with the same name (from an earlier AddTemplateFile attempt)
    const del = await fetch(site + "/_api/web/getfilebyserverrelativeurl('" + site + "/SitePages/spfx-bench.aspx')/recycle()", { method: 'POST', headers: h });
    out.recycle = del.status;
    const cr = await fetch(site + '/_api/sitepages/pages', { method: 'POST', headers: h, body: JSON.stringify({ __metadata: { type: 'SP.Publishing.SitePage' }, PageLayoutType: 'Article' }) });
    const created = (await cr.json()).d;
    out.created = { status: cr.status, id: created.Id, file: created.FileName };
    const sv0 = await fetch(site + '/_api/sitepages/pages(' + created.Id + ')/savepageasdraft', { method: 'POST', headers: h, body: JSON.stringify({ __metadata: { type: 'SP.Publishing.SitePage' }, Title: 'spfx-bench' }) });
    out.save0 = sv0.status;
    const mv = await fetch(site + "/_api/web/getfilebyserverrelativeurl('" + site + "/SitePages/" + created.FileName + "')/moveto(newurl='" + site + "/SitePages/spfx-bench.aspx',flags=1)", { method: 'POST', headers: h });
    out.move = mv.status; if (mv.status >= 300) out.moveText = (await mv.text()).slice(0, 300);
    list = await find();
  }
  const id = list[0].Id;
  out.id = id;
  const co = await fetch(site + '/_api/sitepages/pages(' + id + ')/checkoutpage', { method: 'POST', headers: h });
  out.checkout = co.status;
  const body = { __metadata: { type: 'SP.Publishing.SitePage' }, Title: 'spfx-bench', CanvasContent1: ${JSON.stringify(JSON.stringify(canvas))}, LayoutWebpartsContent: '[]' };
  const sv = await fetch(site + '/_api/sitepages/pages(' + id + ')/savepageasdraft', { method: 'POST', headers: h, body: JSON.stringify(body) });
  out.save = sv.status; out.saveText = (await sv.text()).slice(0, 300);
  return out;
})()`);
log(JSON.stringify(result));
await page.close();
cdp.close();
