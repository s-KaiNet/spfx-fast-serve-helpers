import { Version } from '@microsoft/sp-core-library';
import { GraphClient } from '@microsoft/microsoft-graph-client';

export default class FirstWebPart {
  public readonly version: Version = Version.parse('1.0');
  public readonly client: GraphClient = new GraphClient();
}
