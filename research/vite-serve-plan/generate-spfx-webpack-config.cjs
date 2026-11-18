const path = require('path');
const root = process.cwd();
const t0 = Date.now();
const sp = require('@microsoft/spfx-heft-plugins');
const { Terminal, ConsoleTerminalProvider } = require(require.resolve('@rushstack/terminal', {paths:[require.resolve('@microsoft/spfx-heft-plugins')]}));
(async () => {
  const terminal = new Terminal(new ConsoleTerminalProvider());
  const r = await sp._readConfigFileAsync(()=>{}, path.join(root,'config/config.json')); const configJson = r.configData; console.log('result keys', Object.keys(r));
  console.log('configJson keys', configJson && Object.keys(configJson));
  const cfg = await sp.WebpackConfigurationGenerator.generateWebpackConfigurationAsync({
    configJson, terminal, production: false, serveMode: true,
    projectPackageJson: require(path.join(root, 'package.json')),
    folders: { buildFolder: root, tempFolder: path.join(root,'temp'), outputFolder: path.join(root,'dist'), releaseFolder: path.join(root,'release') }
  });
  const c = Array.isArray(cfg) ? cfg[0] : cfg;
  console.log('ms', Date.now() - t0);
  console.log('entry', JSON.stringify(c.entry));
  console.log('externals', JSON.stringify(c.externals).slice(0, 400));
  console.log('plugins', c.plugins.map(p => p.constructor.name).join(', '));
})().catch(e => { console.error('ERR', e.message, e.stack.split('\n').slice(0,4).join('\n')); });
