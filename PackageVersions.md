# This document contains some important notes regarding different packages and their versions used by `spfx-fast-serve-helpers`

SPFx 1.13 is based on webpack 4.x, which prevents some packages to be updated to the latest version, because some of them have dependency on webpack 5.x only.

- `copy-webpack-plugin` - 6.x is the last version, which [supports webpack 4.x](https://github.com/webpack-contrib/copy-webpack-plugin/blob/master/CHANGELOG.md#700-2020-12-10)

- `css-loader` - 5.x is the last version, which [supports webpack 4.x](https://github.com/webpack-contrib/css-loader/blob/master/CHANGELOG.md#600-2021-07-14)

- `node-sass` - should be the same as the version, used inside SPFx build pipeline

- `sass-loader` - 10.x is the last version, which [supports webpack 4.x](https://github.com/webpack-contrib/sass-loader/blob/master/CHANGELOG.md#1100-2021-02-05). 9.x seems the most stable with SPFx

- `style-loader` - 2.x is the last version, which [supports webpack 4.x](https://github.com/webpack-contrib/style-loader/blob/master/CHANGELOG.md#300-2021-06-24). 1.1.3 seems the most stable with SPFx

- `ts-loader` - 8.x is the last version, which [supports webpack 4.x](https://github.com/TypeStrong/ts-loader/blob/main/CHANGELOG.md#v900)

- `webpack` - should of the same version, as SPFx one
