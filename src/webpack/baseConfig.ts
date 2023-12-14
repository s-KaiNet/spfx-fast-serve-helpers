import webpack from 'webpack';
import * as path from 'path';
import del from 'del';
import * as globby from 'globby';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const certificateManager = require('@rushstack/debug-certificate-manager');
const certificateStore = new certificateManager.CertificateStore();
import { AsyncComponentPlugin } from '@microsoft/spfx-heft-plugins/lib/plugins/webpackConfigurationPlugin/webpackPlugins/AsyncComponentPlugin';

import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';
import { TypeScriptResourcesPlugin } from '../plugins/TypeScriptResourcesPlugin';
import { freePortIfInUse, getExternalComponents } from '../common/helpers';
import { Settings } from '../common/settings';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import { readFile } from 'tsconfig';

const rootFolder = path.resolve(process.cwd());

export async function createBaseConfig(cli: Settings['cli']): Promise<webpack.Configuration> {
  let port = 0;
  if (cli.port) {
    port = cli.port;
  } else if (!cli.isLibraryComponent) {
    port = 4321;
  } else {
    port = 4320
  }

  await freePortIfInUse(port);

  const host = 'https://localhost:' + port;

  const cssLoader = require.resolve('css-loader');
  const themedLoader = {
    loader: require.resolve('@microsoft/loader-load-themed-styles'),
    options: {
      async: true
    }
  }

  const cleanCssLoader = {
    loader: require.resolve('clean-css-loader'),
    options: {
      level: {
        1: {
          all: false,
          removeQuotes: true
        }
      }
    }
  }

  const externalComponents = getExternalComponents();

  const baseConfig: webpack.Configuration = {
    target: 'web',
    mode: 'development',
    devtool: 'eval-source-map',
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
      modules: ['node_modules']
    },
    context: rootFolder,
    module: {
      rules: [
        {
          use: [
            {
              loader: require.resolve('ts-loader'),
              options: {
                transpileOnly: true,
                compilerOptions: {
                  declarationMap: false
                }
              },
            }
          ],
          test: /\.tsx?$/,
          exclude: /node_modules/
        },
        {
          use: [{
            loader: require.resolve('file-loader'),
            options: {
              name: '[name]_[hash].[ext]',
              esModule: false

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
            themedLoader,
            {
              loader: cssLoader,
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
            themedLoader,
            require.resolve('spfx-css-modules-typescript-loader'),
            {
              loader: cssLoader,
              options: {
                esModule: false,
                modules: {
                  localIdentName: '[local]_[hash:base64:8]',
                  mode: (resourcePath: string) => {
                    if (resourcePath.endsWith('.css') && /node_modules/gi.test(resourcePath)) {
                      return 'global';
                    }
                    return 'local';
                  }
                }
              }
            },
            {
              loader: require.resolve('postcss-loader'),
              options: {
                postcssOptions: {
                  plugins: [[require.resolve('autoprefixer'), {
                    overrideBrowserslist: ['> 1%', 'last 2 versions', 'ie >= 10']
                  }]]
                }
              }
            },
            cleanCssLoader,
            {
              loader: require.resolve('sass-loader'),
              options: {
                implementation: require('sass')
              }
            }
          ]
        },
        {
          test: function (fileName) {
            return !fileName.endsWith('.module.scss') && !fileName.endsWith('.vue.scss') && fileName.endsWith('.scss');  // just regular .scss
          },
          use: [
            themedLoader,
            {
              loader: cssLoader,
              options: {
                esModule: false,
                modules: false
              }
            },
            {
              loader: require.resolve('postcss-loader'),
              options: {
                postcssOptions: {
                  plugins: [[require.resolve('autoprefixer'), {
                    overrideBrowserslist: ['> 1%', 'last 2 versions', 'ie >= 10']
                  }]]
                }
              }
            },
            cleanCssLoader,
            {
              loader: require.resolve('sass-loader'),
              options: {
                implementation: require('sass')
              }
            }
          ]
        }
      ]
    },
    plugins: [
      new AsyncComponentPlugin({
        externalComponents
      }),
      new webpack.WatchIgnorePlugin([path.resolve(rootFolder, 'temp')]),
      new ForkTsCheckerWebpackPlugin({
        async: true
      }),
      new TypeScriptResourcesPlugin(),
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
      writeToDisk: cli.isLibraryComponent,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      https: {
        cert: certificateStore.certificateData,
        key: certificateStore.keyData
      }
    },
  }

  const tsConfigPath = path.resolve(rootFolder, 'tsconfig.json');
  const tsconfig = await readFile(tsConfigPath);

  if (tsconfig.baseUrl) {
    baseConfig.resolve.plugins = [
      new TsconfigPathsPlugin({ configFile: tsConfigPath })
    ]
  }

  const files = globby.sync(['src/**/*.module.scss.d.ts'], { cwd: rootFolder });
  del.sync(files, { cwd: rootFolder });

  return baseConfig;
}
