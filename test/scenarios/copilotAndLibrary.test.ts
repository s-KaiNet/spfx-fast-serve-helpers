import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import tls from 'node:tls';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Logger } from '../../src/shared/logger.js';
import type { DebugManifest } from '../../src/features/build/manifests/index.js';
import { startDevServer, type RunningDevServer } from '../../src/server/index.js';
import { prepareServe } from '../../src/session/index.js';
import { freePort, selfSignedCertificate } from '../kit/devServerKit.js';
import { createFakePage, type FakePage } from '../kit/fakePage.js';
import { fixturePath } from '../kit/paths.js';

const COPILOT_COMPONENT_ID = 'e1793060-eada-4fcd-9f1c-cd6f0ccd2b96';
const SP_LOADER_ID = '1c6c9123-7aac-41f3-a376-3caea41ed83f';
const SCHEMA_REFERENCE = '$../../../lib/copilotComponents/savedLinks/SavedLinksCopilotComponentProperties.js:default;';
const PROPERTIES_FILE = 'src/copilotComponents/savedLinks/SavedLinksCopilotComponentProperties.ts';

class FakeCopilotBase {
  public readonly host: string = 'copilot';
}
class FakeWebPartBase {
  public readonly host: string = 'page';
}
const externals: Record<string, unknown> = {
  '@microsoft/sp-copilot-component': { BaseCopilotComponent: FakeCopilotBase },
  '@microsoft/sp-webpart-base': { BaseClientSideWebPart: FakeWebPartBase },
};

function evaluateManifests(source: string): DebugManifest[] {
  let manifests: DebugManifest[] | undefined;
  vm.runInNewContext(source, { define: (_dependencies: string[], factory: () => { getManifests(): DebugManifest[] }) => (manifests = factory().getManifests()) });
  if (!manifests) throw new Error('manifests.js did not call define()');
  return manifests;
}

async function waitFor(condition: () => boolean, description: string, deadline = Date.now() + 20_000): Promise<void> {
  if (condition()) return;
  if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
  await delay(50);
  await waitFor(condition, description, deadline);
}

describe('a web part, a Copilot component and a library component in separate bundles', () => {
  const defaultCaCertificates = tls.getCACertificates('default');
  let root: string;
  let server: RunningDevServer;
  let origin: string;
  let page: FakePage;
  const messages: string[] = [];

  const editFile = (relativePath: string, change: (content: string) => string): void => {
    const file = path.join(root, relativePath);
    writeFileSync(file, change(readFileSync(file, 'utf8')));
  };
  const manifests = async (): Promise<DebugManifest[]> => evaluateManifests(await (await fetch(`${origin}/temp/build/manifests.js`)).text());
  const manifest = async (alias: string): Promise<DebugManifest> => {
    const found = (await manifests()).find((entry) => entry.alias === alias);
    if (!found) throw new Error(`no manifest for ${alias}`);
    return found;
  };
  const warnings = (): string[] => messages.filter((message) => message.startsWith('warn:') || message.startsWith('error:'));

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-copilot-'));
    cpSync(fixturePath('copilot'), root, { recursive: true });
    const certificate = selfSignedCertificate(root);
    tls.setDefaultCACertificates([...defaultCaCertificates, certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const port = await freePort();
    origin = `https://localhost:${port}`;
    const setup = prepareServe({ root, cli: { typeCheck: false, lint: false, port }, logger, env: {} });
    server = await startDevServer({ setup, logger, https: certificate, outputPath: path.join(root, 'out') });
    page = createFakePage({ externals, fetch: (url) => fetch(url) });
  }, 60_000);

  afterAll(async () => {
    await server.close();
    tls.setDefaultCACertificates(defaultCaCertificates);
    rmSync(root, { recursive: true, force: true });
  });

  it('lists the Copilot component like heft: no $schema, package version, propertiesSchema evaluated from src without a lib build', async () => {
    expect(await manifest('SavedLinksCopilotComponent')).toEqual({
      id: '40000000-0000-0000-0000-000000000002',
      alias: 'SavedLinksCopilotComponent',
      componentType: 'CopilotComponent',
      copilotType: 'Ux',
      version: '1.3.0',
      manifestVersion: 2,
      capabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
      tools: [
        {
          name: 'SavedLinksTool',
          description: { default: 'Saved links' },
          propertiesSchema: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: { message: { type: 'string', description: 'A message to display.' } },
            additionalProperties: false,
          },
        },
      ],
      loaderConfig: {
        internalModuleBaseUrls: [`${origin}/dist/`],
        entryModuleId: 'saved-links-copilot-component',
        scriptResources: {
          'saved-links-copilot-component': { type: 'path', path: 'saved-links-copilot-component.js' },
          '@microsoft/sp-copilot-component': { type: 'component', id: COPILOT_COMPONENT_ID, version: '1.24.1' },
          '@microsoft/sp-loader': { type: 'component', id: SP_LOADER_ID, version: '1.24.1' },
        },
      },
    });
    expect(warnings()).toEqual([]);
    expect(readdirSync(path.join(root, 'temp/fast-serve/manifest-references'))).toEqual([]);
  });

  it('serves the Copilot component bundle with its localized strings', async () => {
    const response = await fetch(`${origin}/dist/saved-links-copilot-component.js`);
    expect(response.status).toBe(200);
    const exports = page.loadAmdBundle(await response.text()) as { default: new () => FakeCopilotBase & { render(properties: { message: string }): string } };
    const component = new exports.default();
    expect(component).toBeInstanceOf(FakeCopilotBase);
    expect(component.render({ message: 'hi' })).toBe('Saved links: hi');
  });

  it('builds and lists a library-only bundle so deployed components can load it from the dev server', async () => {
    expect(await manifest('ToolsLibrary')).toEqual({
      id: '40000000-0000-0000-0000-000000000003',
      alias: 'ToolsLibrary',
      componentType: 'Library',
      version: '1.3.0',
      manifestVersion: 2,
      loaderConfig: {
        internalModuleBaseUrls: [`${origin}/dist/`],
        entryModuleId: 'tools-library',
        scriptResources: {
          'tools-library': { type: 'path', path: 'tools-library.js' },
          '@microsoft/sp-loader': { type: 'component', id: SP_LOADER_ID, version: '1.24.1' },
        },
      },
    });
    const exports = page.loadAmdBundle(await (await fetch(`${origin}/dist/tools-library.js`)).text()) as { formatTool(name: string): string };
    expect(exports.formatTool('hammer')).toBe('tool: hammer');
    expect((await manifest('HelloWebPart')).loaderConfig.entryModuleId).toBe('hello-web-part');
  });

  it('re-evaluates the schema when the properties module or a module it imports changes', async () => {
    editFile('src/copilotComponents/savedLinks/messageField.ts', (content) => content.replace('A message to display.', 'The text to show.'));
    const [tool] = (await manifest('SavedLinksCopilotComponent')).tools as { propertiesSchema: { properties: { message: { description: string } } } }[];
    expect(tool?.propertiesSchema.properties.message.description).toBe('The text to show.');
  });

  it('keeps the reference and warns once when the schema module throws, and recovers after the fix', async () => {
    const original = readFileSync(path.join(root, PROPERTIES_FILE), 'utf8');
    editFile(PROPERTIES_FILE, (content) => content.replace('export default', 'throw new Error("schema broke");\nexport default'));
    const broken = await manifest('SavedLinksCopilotComponent');
    await manifest('SavedLinksCopilotComponent');
    expect((broken.tools as { propertiesSchema: unknown }[])[0]?.propertiesSchema).toEqual({ id: SCHEMA_REFERENCE });
    expect(warnings()).toEqual([
      `warn: SavedLinksCopilotComponent: tool "SavedLinksTool" propertiesSchema "${SCHEMA_REFERENCE}" is not resolved, the debug manifest keeps the reference: ${PROPERTIES_FILE} failed to evaluate: schema broke`,
    ]);
    writeFileSync(path.join(root, PROPERTIES_FILE), original);
    const fixed = await manifest('SavedLinksCopilotComponent');
    expect((fixed.tools as { propertiesSchema: { type: string } }[])[0]?.propertiesSchema.type).toBe('object');
    expect(warnings()).toHaveLength(1);
  });

  it('reloads the page when the Copilot component class changes, like a web part class', async () => {
    await delay(500);
    editFile('src/copilotComponents/savedLinks/SavedLinksCopilotComponent.ts', (content) => content.replace('${strings.Title}: ', '${strings.Title} - '));
    await waitFor(() => page.reloads() > 0, 'a reload after the component class edit');
    expect(page.reloads()).toBeGreaterThan(0);
  }, 30_000);
});
