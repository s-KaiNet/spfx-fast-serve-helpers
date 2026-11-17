import { Version } from '@microsoft/sp-core-library';
import $ from 'jquery';
import legacy from './legacy.cjs';
import plugin from './jquery-plugin.cjs';

export const result = () => ({ version: Version, escape: legacy.escape, ajax: $.ajax, jqueryVersion: plugin.jqueryVersion() });
