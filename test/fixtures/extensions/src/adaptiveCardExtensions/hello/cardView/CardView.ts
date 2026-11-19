import { BaseComponentsCardView } from '@microsoft/sp-adaptive-card-extension-base';
import * as strings from 'HelloAdaptiveCardExtensionStrings';
import logo from '../assets/MicrosoftLogo.png';

export class CardView extends BaseComponentsCardView {
  public readonly text: string = strings.CardViewText;
  public readonly icon: string = logo;
}
