const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve modules from
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Block root node_modules to prevent duplicate React copies
config.resolver.blockList = exclusionList([
    new RegExp(`${path.resolve(workspaceRoot, 'node_modules/react')}/.*`),
    new RegExp(`${path.resolve(workspaceRoot, 'node_modules/react-dom')}/.*`),
    // We don't block react-native here because expo-router might need it from root if not in project
    // But usually it IS in project for Expo apps.
]);

// 4. Force single instances of core React libraries
config.resolver.extraNodeModules = {
    '@core': path.resolve(workspaceRoot, 'packages/core/src'),
    'react': path.resolve(projectRoot, 'node_modules/react'),
    'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
};

// 5. Enable symlinks for out-of-tree module resolution
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
