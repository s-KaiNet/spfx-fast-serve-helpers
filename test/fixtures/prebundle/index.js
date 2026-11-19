import { Version } from '@microsoft/sp-core-library';
import $, { ajax } from 'jquery';
import legacy from './legacy.cjs';
import plugin from './jquery-plugin.cjs';

export const result = () => ({ version: Version, escape: legacy.escape, ajax: $.ajax, namedAjax: ajax, jqueryVersion: plugin.jqueryVersion() });
