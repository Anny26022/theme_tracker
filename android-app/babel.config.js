const path = require('path');

module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
        plugins: [
            [
                'module-resolver',
                {
                    root: ['./'],
                    alias: {
                        '@': './src',
                        '@core': '../packages/core/src',
                        // Force local singleton for React
                        'react': path.resolve(__dirname, 'node_modules/react'),
                        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
                    },
                },
            ],
        ],
    };
};
