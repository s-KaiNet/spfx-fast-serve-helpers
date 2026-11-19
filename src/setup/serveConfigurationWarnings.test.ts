import { describe, expect, it } from 'vitest';
import type { ComponentManifest, SpfxComponent } from '../project/index.js';
import { serveConfigurationWarnings } from './serveConfigurationWarnings.js';

function component(manifest: Pick<ComponentManifest, 'id' | 'alias' | 'componentType' | 'extensionType'>): SpfxComponent {
  return { bundleName: 'b', manifestFile: '/p/m.json', entryFile: '/p/e.ts', manifest: { ...manifest, version: '1.0.0' } };
}

const components = [
  component({ id: 'aaaaaaaa-0000-0000-0000-000000000001', alias: 'Banner', componentType: 'Extension', extensionType: 'ApplicationCustomizer' }),
  component({ id: 'aaaaaaaa-0000-0000-0000-000000000002', alias: 'Commands', componentType: 'Extension', extensionType: 'ListViewCommandSet' }),
  component({ id: 'aaaaaaaa-0000-0000-0000-000000000003', alias: 'Rating', componentType: 'Extension', extensionType: 'FieldCustomizer' }),
  component({ id: 'aaaaaaaa-0000-0000-0000-000000000004', alias: 'Feedback', componentType: 'Extension', extensionType: 'FormCustomizer' }),
  component({ id: 'aaaaaaaa-0000-0000-0000-000000000005', alias: 'HelloWebPart', componentType: 'WebPart' }),
];

describe('serveConfigurationWarnings', () => {
  it('accepts configurations that match the served extensions (ids case-insensitive)', () => {
    expect(
      serveConfigurationWarnings(
        'all',
        {
          customActions: {
            'AAAAAAAA-0000-0000-0000-000000000001': { location: 'ClientSideExtension.ApplicationCustomizer' },
            'aaaaaaaa-0000-0000-0000-000000000002': { location: 'ClientSideExtension.ListViewCommandSet.CommandBar' },
          },
          fieldCustomizers: { Title: { id: 'aaaaaaaa-0000-0000-0000-000000000003' } },
          formCustomizer: { componentId: 'aaaaaaaa-0000-0000-0000-000000000004', PageType: 8, RootFolder: '/sites/dev/Lists/Tasks' },
        },
        components,
      ),
    ).toEqual([]);
  });

  it('reports unknown ids, wrong extension types, unknown locations and generator placeholders', () => {
    expect(
      serveConfigurationWarnings(
        'broken',
        {
          customActions: {
            'bbbbbbbb-0000-0000-0000-000000000000': { location: 'ClientSideExtension.ApplicationCustomizer' },
            'aaaaaaaa-0000-0000-0000-000000000003': { location: 'ClientSideExtension.ListViewCommandSet' },
            'aaaaaaaa-0000-0000-0000-000000000001': { location: 'Somewhere' },
          },
          fieldCustomizers: { InternalFieldName: { id: 'aaaaaaaa-0000-0000-0000-000000000005' } },
          formCustomizer: { PageType: 8, RootFolder: '/sites/mySite/Lists/MyList' },
        },
        components,
      ),
    ).toEqual([
      'config/serve.json serveConfigurations.broken.customActions.bbbbbbbb-0000-0000-0000-000000000000: "bbbbbbbb-0000-0000-0000-000000000000" is not a component fast-serve serves (check the id against the extension manifests in config/config.json)',
      'config/serve.json serveConfigurations.broken.customActions.aaaaaaaa-0000-0000-0000-000000000003: Rating is FieldCustomizer, expected ListViewCommandSet',
      'config/serve.json serveConfigurations.broken.customActions.aaaaaaaa-0000-0000-0000-000000000001: unknown location "Somewhere" (expected one of ClientSideExtension.ApplicationCustomizer, ClientSideExtension.ListViewCommandSet.ContextMenu, ClientSideExtension.ListViewCommandSet.CommandBar, ClientSideExtension.ListViewCommandSet, ClientSideExtension.SearchQueryModifier)',
      'config/serve.json serveConfigurations.broken.fieldCustomizers: "InternalFieldName" is the generator\'s placeholder: use the internal name of a field of the list on the page',
      'config/serve.json serveConfigurations.broken.fieldCustomizers.InternalFieldName.id: HelloWebPart is WebPart, expected FieldCustomizer',
      'config/serve.json serveConfigurations.broken.formCustomizer.componentId: no component id',
      'config/serve.json serveConfigurations.broken.formCustomizer.RootFolder: "/sites/mySite/Lists/MyList" is the generator\'s placeholder: use the server-relative URL of your list',
    ]);
  });
});
