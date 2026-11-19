import { BaseAdaptiveCardQuickView } from '@microsoft/sp-adaptive-card-extension-base';
import template from './template/QuickViewTemplate.json';

export class QuickView extends BaseAdaptiveCardQuickView {
  public get template(): { type: string; body: { text: string }[] } {
    return template;
  }
}
