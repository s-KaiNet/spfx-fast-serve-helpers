import { describe, expect, it } from 'vitest';
import { readServeConfigurations } from './serveConfigurations.js';

describe('readServeConfigurations', () => {
  it('returns undefined when serve.json has none', () => {
    expect(readServeConfigurations(undefined)).toBeUndefined();
  });

  it('reads the configurations the SPFx generator writes', () => {
    const generated = {
      default: {
        pageUrl: 'https://{tenantDomain}/SitePages/myPage.aspx',
        customActions: {
          'f1e9c965-12f5-4beb-9103-7640ed381a72': { location: 'ClientSideExtension.ApplicationCustomizer', properties: { testMessage: 'Test message' } },
        },
      },
      rating: {
        pageUrl: 'https://{tenantDomain}/SitePages/myPage.aspx',
        fieldCustomizers: { InternalFieldName: { id: '21fe7eba-88c8-4a4b-ad68-52b7d32f1607', properties: { sampleText: 'Value' } } },
      },
      feedback_EditForm: {
        pageUrl: 'https://{tenantDomain}/_layouts/15/SPListForm.aspx',
        formCustomizer: { componentId: '29b61138-a710-4379-b616-98f496c16e4f', PageType: 6, RootFolder: '/sites/mySite/Lists/MyList', ID: 1, properties: { sampleText: 'Value' } },
      },
    };
    expect(readServeConfigurations(generated)).toEqual(generated);
  });

  it('drops unknown keys and keeps configurations without a page', () => {
    expect(readServeConfigurations({ noPage: { customActions: {}, other: 1 } })).toEqual({ noPage: { customActions: {} } });
  });

  it('names the broken entry', () => {
    expect(() => readServeConfigurations([])).toThrow('config/serve.json: "serveConfigurations" must be an object');
    expect(() => readServeConfigurations({ a: { pageUrl: 5 } })).toThrow('"serveConfigurations.a.pageUrl" must be a non-empty string');
    expect(() => readServeConfigurations({ a: { customActions: { x: { properties: {} } } } })).toThrow(
      '"serveConfigurations.a.customActions.x.location" must be a non-empty string',
    );
    expect(() => readServeConfigurations({ a: { fieldCustomizers: { Title: {} } } })).toThrow('"serveConfigurations.a.fieldCustomizers.Title.id"');
    expect(() => readServeConfigurations({ a: { fieldCustomizers: { Title: { id: 'x', properties: 'p' } } } })).toThrow(
      '"serveConfigurations.a.fieldCustomizers.Title.properties" must be an object',
    );
    expect(() => readServeConfigurations({ a: { formCustomizer: 'x' } })).toThrow('"serveConfigurations.a.formCustomizer" must be an object');
  });
});
