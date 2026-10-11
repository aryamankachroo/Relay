import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.relay.hacknc',
  appName: 'Relay',
  webDir: 'build/client',
  ios: {
    contentInset: 'automatic',
  },
}

export default config
