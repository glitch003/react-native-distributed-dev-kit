import { SDKD_HOST } from 'react-native-dotenv'

export default class SDKDConfig {
  static init (apiKey) {
    console.log('SDKD host: ' + SDKD_HOST)
    global.sdkdConfig = {
      apiKey: apiKey,
      sdkdHost: SDKD_HOST,
      moduleConfig: {}
    }
  }
}
