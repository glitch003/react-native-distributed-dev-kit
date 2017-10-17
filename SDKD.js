export default class SDKD {
  constructor(apiKey){
    this.apiKey = apiKey;
    console.log('[SDKD]: constructor()');
  }
  generateWallet(email){
    console.log('[SDKD]: generateWallet('+email+')');
  }
}