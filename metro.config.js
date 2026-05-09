const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (
      moduleName.includes('expo-sqlite') ||
      moduleName.includes('@nozbe/watermelondb') ||
      moduleName.includes('wa-sqlite')
    ) {
      return { type: 'empty' }
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config