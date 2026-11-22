import { isObject, type JsonObject } from '../shared/guards.js';
import type { CustomAction, FieldCustomizer, ServeConfiguration } from './types.js';

const SOURCE = 'config/serve.json';

export const CUSTOM_ACTION_LOCATIONS = [
  'ClientSideExtension.ApplicationCustomizer',
  'ClientSideExtension.ListViewCommandSet.ContextMenu',
  'ClientSideExtension.ListViewCommandSet.CommandBar',
  'ClientSideExtension.ListViewCommandSet',
  'ClientSideExtension.SearchQueryModifier',
];

export function readServeConfigurations(value: unknown): Record<string, ServeConfiguration> | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) throw new Error(`${SOURCE}: "serveConfigurations" must be an object`);
  return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, readServeConfiguration(`serveConfigurations.${name}`, entry)]));
}

function readServeConfiguration(where: string, value: unknown): ServeConfiguration {
  const entry = expectObject(where, value);
  const configuration: ServeConfiguration = {};
  if (entry.pageUrl !== undefined) configuration.pageUrl = expectString(`${where}.pageUrl`, entry.pageUrl);
  if (entry.customActions !== undefined) configuration.customActions = readCustomActions(`${where}.customActions`, entry.customActions);
  if (entry.fieldCustomizers !== undefined) {
    configuration.fieldCustomizers = readFieldCustomizers(`${where}.fieldCustomizers`, entry.fieldCustomizers);
  }
  if (entry.formCustomizer !== undefined) configuration.formCustomizer = expectObject(`${where}.formCustomizer`, entry.formCustomizer);
  return configuration;
}

function readCustomActions(where: string, value: unknown): Record<string, CustomAction> {
  return mapEntries(where, value, (entryWhere, entry) => ({
    location: expectString(`${entryWhere}.location`, entry.location),
    ...optionalProperties(entryWhere, entry),
  }));
}

function readFieldCustomizers(where: string, value: unknown): Record<string, FieldCustomizer> {
  return mapEntries(where, value, (entryWhere, entry) => ({
    id: expectString(`${entryWhere}.id`, entry.id),
    ...optionalProperties(entryWhere, entry),
  }));
}

function mapEntries<T>(where: string, value: unknown, read: (entryWhere: string, entry: JsonObject) => T): Record<string, T> {
  return Object.fromEntries(
    Object.entries(expectObject(where, value)).map(([key, entry]) => [key, read(`${where}.${key}`, expectObject(`${where}.${key}`, entry))]),
  );
}

function optionalProperties(where: string, entry: JsonObject): { properties?: JsonObject } {
  return entry.properties === undefined ? {} : { properties: expectObject(`${where}.properties`, entry.properties) };
}

function expectObject(where: string, value: unknown): JsonObject {
  if (!isObject(value)) throw new Error(`${SOURCE}: "${where}" must be an object`);
  return value;
}

function expectString(where: string, value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${SOURCE}: "${where}" must be a non-empty string`);
  return value;
}
