import { PropertyPaneTextField } from '@microsoft/sp-property-pane';
import * as strings from 'HelloAdaptiveCardExtensionStrings';

export class HelloPropertyPane {
  public readonly field: unknown = PropertyPaneTextField;
  public readonly label: string = strings.TitleFieldLabel;
}
