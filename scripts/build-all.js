const path = require('path');
const webpack = require('webpack');

const ROOT_DIR = path.resolve(__dirname, '..');

async function runBuild() {
  console.log('--- Building Chrome Extension ---');
  const chromeConfigPath = path.resolve(ROOT_DIR, 'chrome-extension', 'webpack.content.js');
  const chromeConfig = require(chromeConfigPath);
  chromeConfig.context = path.resolve(ROOT_DIR, 'chrome-extension');

  await new Promise((resolve, reject) => {
    webpack(chromeConfig, (err, stats) => {
      if (err) return reject(err);
      if (stats.hasErrors()) {
        console.error(stats.toString({ colors: true, errors: true }));
        return reject(new Error('Chrome Extension build failed'));
      }
      console.log('Chrome Extension built successfully.');
      resolve();
    });
  });

  console.log('--- Building React Options App ---');
  const reactConfigPath = path.resolve(ROOT_DIR, 'react-app', 'webpack.config.js');
  const reactConfig = require(reactConfigPath);
  reactConfig.context = path.resolve(ROOT_DIR, 'react-app');

  await new Promise((resolve, reject) => {
    webpack(reactConfig, (err, stats) => {
      if (err) return reject(err);
      if (stats.hasErrors()) {
        console.error(stats.toString({ colors: true, errors: true }));
        return reject(new Error('React App build failed'));
      }
      console.log('React App built successfully.');
      resolve();
    });
  });

  console.log('--- ALL BUILDS COMPLETED SUCCESSFULLY! Output is in dist/ ---');
}

runBuild().catch((err) => {
  console.error('Build Error:', err);
  process.exit(1);
});
