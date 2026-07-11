const path = require('path');

const projectRoot = __dirname;

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: [projectRoot],
          alias: {
            '@': projectRoot,
          },
          extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
        },
      ],
      'react-native-worklets/plugin',
      ['react-native-worklets-core/plugin'],
    ],
  };
};
