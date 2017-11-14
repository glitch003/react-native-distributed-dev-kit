export default class SDKDConfig {
  static init (apiKey) {
    global.sdkdConfig = {
      apiKey: apiKey,
      sdkdHost: 'https://sdk-d.herokuapp.com',
      moduleConfig: {},
      unsignedApiKey: this._extractDataFromApiKey(apiKey)
    }
  }

  static _extractDataFromApiKey (apiKey) {
    return apiKey.split('.')[1]
  }
}
