import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';

export default class HelloWebPart extends BaseClientSideWebPart {
  public readonly greeting: string = 'Hello web part';
}
