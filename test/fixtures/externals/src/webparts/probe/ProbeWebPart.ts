import { Version } from '@microsoft/sp-core-library';
import DeepTextField, { PropertyPaneTextField } from '@microsoft/sp-property-pane/lib/fields/PropertyPaneTextField';
import { render } from 'ejs';
import * as ejs from 'ejs';
import ApexCharts from 'apexcharts';
import * as apexNamespace from 'apexcharts';
import * as strings from 'ProbeStrings';
import * as tsStrings from 'TsStrings';
import tsDefault from 'TsStrings';
import { controlLabel, controlToggle } from '@contoso/controls';
import * as reexports from './reexports';
import { Label } from './components/Label';

declare const require: (name: string) => unknown;

export default class ProbeWebPart {
  public readonly version: unknown = Version;
  public readonly textField: unknown = PropertyPaneTextField;
  public readonly deepDefault: unknown = DeepTextField;
  public readonly render: unknown = render;
  public readonly ejsNamespace: unknown = ejs;
  public readonly apexDefault: unknown = ApexCharts;
  public readonly apexNamespace: unknown = apexNamespace;
  public readonly legacyChart: unknown = require('legacy-chart');
  public readonly title: string = strings.Title;
  public readonly tsGreeting: string = tsStrings.Greeting;
  public readonly tsDefaultGreeting: string = tsDefault.Greeting;
  public readonly controlLabel: string = controlLabel();
  public readonly controlToggle: string = controlToggle();
  public readonly reexports: unknown = reexports;
  public readonly label: unknown = Label;

  public async loadLazy(): Promise<string> {
    const { lazyGreeting } = await import('./lazy');
    return lazyGreeting();
  }
}
