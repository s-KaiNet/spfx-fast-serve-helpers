import * as strings from 'CorpLibStrings';
import { formatName } from '@corp/format';

export class CorpLibrary {
  public greet(name: string): string {
    return `${strings.Greeting}, ${formatName(name)}`;
  }
}
