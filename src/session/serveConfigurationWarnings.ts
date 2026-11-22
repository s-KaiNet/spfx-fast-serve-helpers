import { CUSTOM_ACTION_LOCATIONS, type ServeConfiguration, type SpfxComponent } from '../project/index.js';

const LOCATION_EXTENSION_TYPES: Record<string, string> = {
  'ClientSideExtension.ApplicationCustomizer': 'ApplicationCustomizer',
  'ClientSideExtension.ListViewCommandSet.ContextMenu': 'ListViewCommandSet',
  'ClientSideExtension.ListViewCommandSet.CommandBar': 'ListViewCommandSet',
  'ClientSideExtension.ListViewCommandSet': 'ListViewCommandSet',
  'ClientSideExtension.SearchQueryModifier': 'SearchQueryModifier',
};

const GENERATOR_PLACEHOLDER_FIELD = 'InternalFieldName';
const GENERATOR_PLACEHOLDER_ROOT_FOLDER = '/sites/mySite/Lists/MyList';

export function serveConfigurationWarnings(name: string, configuration: ServeConfiguration, components: readonly SpfxComponent[]): string[] {
  const where = `config/serve.json serveConfigurations.${name}`;
  const byId = new Map(components.map((component) => [component.manifest.id.toLowerCase(), component]));
  const warnings: string[] = [];

  const checkComponent = (path: string, id: unknown, expectedExtensionType: string | undefined) => {
    if (typeof id !== 'string' || id === '') {
      warnings.push(`${where}.${path}: no component id`);
      return;
    }
    const component = byId.get(id.toLowerCase());
    if (!component) {
      warnings.push(`${where}.${path}: "${id}" is not a component fast-serve serves (check the id against the extension manifests in config/config.json)`);
      return;
    }
    const { alias, extensionType } = component.manifest;
    if (expectedExtensionType !== undefined && extensionType !== expectedExtensionType) {
      warnings.push(`${where}.${path}: ${alias} is ${extensionType ?? component.manifest.componentType}, expected ${expectedExtensionType}`);
    }
  };

  for (const [id, action] of Object.entries(configuration.customActions ?? {})) {
    if (!CUSTOM_ACTION_LOCATIONS.includes(action.location)) {
      warnings.push(`${where}.customActions.${id}: unknown location "${action.location}" (expected one of ${CUSTOM_ACTION_LOCATIONS.join(', ')})`);
    }
    checkComponent(`customActions.${id}`, id, LOCATION_EXTENSION_TYPES[action.location]);
  }
  for (const [field, customizer] of Object.entries(configuration.fieldCustomizers ?? {})) {
    if (field === GENERATOR_PLACEHOLDER_FIELD) {
      warnings.push(`${where}.fieldCustomizers: "${field}" is the generator's placeholder: use the internal name of a field of the list on the page`);
    }
    checkComponent(`fieldCustomizers.${field}.id`, customizer.id, 'FieldCustomizer');
  }
  const { formCustomizer } = configuration;
  if (formCustomizer) {
    checkComponent('formCustomizer.componentId', formCustomizer.componentId, 'FormCustomizer');
    if (formCustomizer.RootFolder === GENERATOR_PLACEHOLDER_ROOT_FOLDER) {
      warnings.push(`${where}.formCustomizer.RootFolder: "${GENERATOR_PLACEHOLDER_ROOT_FOLDER}" is the generator's placeholder: use the server-relative URL of your list`);
    }
  }
  return warnings;
}
