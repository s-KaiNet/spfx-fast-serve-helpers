import webpack from 'webpack';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const CertStore = require('@microsoft/gulp-core-build-serve/lib/CertificateStore');
const CertificateStore = CertStore.CertificateStore || CertStore.default;

import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import { ClearCssModuleDefinitionsPlugin } from '../plugins/ClearCssModuleDefinitionsPlugin';
import { getJSONFile, getLoggingLevel } from './helpers';
import { Settings } from '../common/settings';

const packageJson = getJSONFile('package.json');
const hasESLint = !!packageJson.devDependencies['@typescript-eslint/parser'];
const rootFolder = path.resolve(process.cwd());

export function createBaseConfig(settings: Settings): webpack.Configuration {
  const port = settings.cli.isLibraryComponent ? 4320 : 4321;
  const host = 'https://localhost:' + port;

  const themedLoader = require.resolve('@microsoft/loader-load-themed-styles');

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
          loader: require.resolve('ts-loader'),
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
            loader: require.resolve('@microsoft/loader-cased-file'),
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
              loader: themedLoader,
              options: {
                async: true
              }
            },
            {
              loader: require.resolve('css-loader')
            }
          ]
        },
        {
          test: function (fileName) {
            return fileName.endsWith('.module.scss');   // scss modules support
          },
          use: [
            {
              loader: themedLoader,
              options: {
                async: true
              }
            },
            require.resolve('spfx-css-modules-typescript-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[local]_[hash:base64:8]'
                }
              }
            }, // translates CSS into CommonJS
            require.resolve('sass-loader') // compiles Sass to CSS, using Sass by default
          ]
        },
        {
          test: function (fileName) {
            return !fileName.endsWith('.module.scss') && fileName.endsWith('.scss');  // just regular .scss
          },
          use: [
            {
              loader: themedLoader,
              options: {
                async: true
              }
            },
            {
              loader: require.resolve('css-loader')
            }, // translates CSS into CommonJS
            require.resolve('sass-loader') // compiles Sass to CSS, using Sass by default
          ]
        }
      ]
    },
    plugins: [
      new ForkTsCheckerWebpackPlugin({
        eslint: hasESLint
      }),
      new ClearCssModuleDefinitionsPlugin({
        deleted: false,
        rootFolder
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
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
      proxy: { // url re-write for resources to be served directly from src folder
        '/lib/**/loc/*.js': {
          target: host,
          pathRewrite: { '^/lib': '/src' },
          secure: false
        }
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      https: {
        cert: CertificateStore.instance.certificateData,
        key: CertificateStore.instance.keyData  
      }
    },
  }

  return baseConfig;
}