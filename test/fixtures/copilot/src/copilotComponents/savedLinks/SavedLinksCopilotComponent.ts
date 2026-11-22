import { BaseCopilotComponent } from '@microsoft/sp-copilot-component';
import * as strings from 'SavedLinksCopilotComponentStrings';
import type { ISavedLinksCopilotComponentProperties } from './SavedLinksCopilotComponentProperties';

export default class SavedLinksCopilotComponent extends BaseCopilotComponent {
  public render(properties: ISavedLinksCopilotComponentProperties): string {
    return `${strings.Title}: ${properties.message}`;
  }
}
