import { LoaderContext } from 'webpack';
import { ResourceData, SPFxConfig } from '../common/types';
import { createResourcesMap, getJSONFile } from '../common/helpers';

export default function loader(this: LoaderContext<any>) {
  const config = getJSONFile<SPFxConfig>('config/config.json');
  const resourcesMap: Record<string, ResourceData> = createResourcesMap(config.localizedResources);

  const template = 'require("###");';
  let result = '';
  for (const key in resourcesMap) {
    const map = resourcesMap[key];
    result += template.replace('###', './' + map.path);
  }

  return result;
}
