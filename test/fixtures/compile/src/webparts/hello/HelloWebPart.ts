import { Version } from '@microsoft/sp-core-library';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import * as strings from 'HelloWebPartStrings';
import { renderHello } from './components/Hello';
import type { IHelloProps } from './components/IHelloProps';
import logo from './assets/logo.png';
import settings from './settings.json';

declare const DEBUG: boolean;

export default class HelloWebPart extends BaseClientSideWebPart {
  public readonly title: string = strings.Title;
  public readonly logo: string = logo;
  public readonly debug: boolean = DEBUG;
  public readonly environment: string | undefined = process.env.NODE_ENV;
  public readonly settings: { color: string } = settings;

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  public render(): unknown {
    const props: IHelloProps = { title: this.title };
    return renderHello(props);
  }
}
