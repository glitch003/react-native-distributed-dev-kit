export default class SDKDConfig {
  static init (apiKey) {
    global.sdkdConfig = {
      apiKey: apiKey,
      sdkdHost: 'http://localhost:3000',
      // sdkdHost: 'https://sdk-d.herokuapp.com',
      moduleConfig: {}
    }
  }
}
