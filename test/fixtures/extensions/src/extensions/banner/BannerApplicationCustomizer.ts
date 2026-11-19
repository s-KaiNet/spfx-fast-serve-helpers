import { BaseApplicationCustomizer } from '@microsoft/sp-application-base';
import { message } from './message';

export default class BannerApplicationCustomizer extends BaseApplicationCustomizer {
  public readonly message: string = message;
}
