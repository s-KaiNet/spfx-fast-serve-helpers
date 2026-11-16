import { http } from './http.js';
import { PropertyPaneTextField } from '@microsoft/sp-property-pane';
export const lazy = () => 'lazy:' + http() + ':' + PropertyPaneTextField.name;
