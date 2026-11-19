import { BaseAdaptiveCardExtension } from '@microsoft/sp-adaptive-card-extension-base';
import { CardView } from './cardView/CardView';
import { QuickView } from './quickView/QuickView';
import type { HelloPropertyPane } from './HelloPropertyPane';

export default class HelloAdaptiveCardExtension extends BaseAdaptiveCardExtension {
  public propertyPane: HelloPropertyPane | undefined;
  public readonly cardView: CardView = new CardView();
  public readonly quickView: QuickView = new QuickView();

  public loadPropertyPaneResources(): Promise<void> {
    return import(/* webpackChunkName: 'Hello-property-pane' */ './HelloPropertyPane').then((component) => {
      this.propertyPane = new component.HelloPropertyPane();
    });
  }
}
