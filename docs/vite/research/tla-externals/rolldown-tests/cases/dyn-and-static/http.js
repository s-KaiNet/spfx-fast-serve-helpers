import { SPHttpClient } from '@microsoft/sp-http';
export const http = () => 'http:' + SPHttpClient.name;
