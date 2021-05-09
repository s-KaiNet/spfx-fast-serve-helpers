import webpack from 'webpack';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const certificateManager = require('@rushstack/debug-certificate-manager');
const certificateStore = new certificateManager.CertificateStore();

import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import { ClearCssModuleDefinitionsPlugin } from '../plugins/ClearCssModuleDefinitionsPlugin';
import { getJSONFile, getLoggingLevel } from './helpers';
import { Settings } from '../common/settings';

const packageJson = getJSONFile('package.json');
const hasESLint = !!packageJson.devDependencies['@typescript-eslint/parser'];
const rootFolder = path.resolve(process.cwd());

export function createBaseConfig(settings: Settings): webpack.Configuration {
  let RestProxy: any;

  const port = settings.cli.isLibraryComponent ? 4320 : 4321;
  const host = 'https://localhost:' + port;

  const baseConfig: webpack.Configuration = {
    target: 'web',
    mode: 'development',
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      modules: ['node_modules']
    },
    context: rootFolder,
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              declarationMap: false
            }
          },
          exclude: /node_modules/
        },
        {
          use: [{
            loader: '@microsoft/loader-cased-file',
            options: {
              name: '[name:lower]_[hash].[ext]'
            }
          }],
          test: /\.(jpe?g|png|woff|eot|ttf|svg|gif|dds)$/i
        },
        {
          use: [{
            loader: 'html-loader'
          }],
          test: /\.html$/
        },
        {
          test: /\.css$/,
          use: [
            {
              loader: '@microsoft/loader-load-themed-styles',
              options: {
                async: true
              }
            },
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                modules: false
              }
            }
          ]
        },
        {
          test: function (fileName) {
            return fileName.endsWith('.module.scss');   // scss modules support
          },
          use: [
            {
              loader: '@microsoft/loader-load-themed-styles',
              options: {
                async: true
              }
            },
            'css-modules-typescript-loader',
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                modules: {
                  localIdentName: '[local]_[hash:base64:8]'
                }
              }
            }, // translates CSS into CommonJS
            'sass-loader' // compiles Sass to CSS, using Sass by default
          ]
        },
        {
          test: function (fileName) {
            return !fileName.endsWith('.module.scss') && fileName.endsWith('.scss');  // just regular .scss
          },
          use: [
            {
              loader: '@microsoft/loader-load-themed-styles',
              options: {
                async: true
              }
            },
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                modules: false
              }
            }, // translates CSS into CommonJS
            'sass-loader' // compiles Sass to CSS, using Sass by default
          ]
        }
      ]
    },
    plugins: [
      new ForkTsCheckerWebpackPlugin({
        eslint: hasESLint ? {
          files: './src/**/*.{ts,tsx}',
          enabled: true
        } : undefined,
        async: true
      }),
      new ClearCssModuleDefinitionsPlugin({
        deleted: false,
        rootFolder
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        'process.env.DEBUG': JSON.stringify(true),
        'DEBUG': JSON.stringify(true)
      })],
    devServer: {
      hot: false,
      contentBase: rootFolder,
      publicPath: host + '/dist/',
      host: 'localhost',
      port: port,
      disableHostCheck: true,
      historyApiFallback: true,
      open: settings.serve.open,
      writeToDisk: settings.cli.isLibraryComponent,
      openPage: settings.serve.openUrl ? settings.serve.openUrl : host + '/temp/workbench.html',
      overlay: settings.serve.fullScreenErrors,
      stats: getLoggingLevel(settings.serve.loggingLevel),
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      https: {
        cert: certificateStore.certificateData,
        key: certificateStore.keyData
      }
    },
  }

  if (settings.cli.useRestProxy) {
    RestProxy = require('sp-rest-proxy');
  }

  if (settings.cli.useRestProxy) {
    baseConfig.devServer.before = function (app) {
      new RestProxy({
        port,
        logLevel: 'Off'
      }, app).serveProxy();
    }
  }

  return baseConfig;
}