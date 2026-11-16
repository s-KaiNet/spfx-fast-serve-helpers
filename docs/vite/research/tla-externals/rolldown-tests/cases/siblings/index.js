// three sibling SPFx imports in one dep: bundled output awaits them one after another
import { Version } from '@microsoft/sp-core-library';
import { SPHttpClient } from '@microsoft/sp-http';
import { PropertyPaneTextField } from '@microsoft/sp-property-pane';
export const result = () => [Version.name, SPHttpClient.name, PropertyPaneTextField.name].join(',');
