import Wallet from './myetherwallet.js';

export default class SDKD {
  constructor(apiKey){
    this.apiKey = apiKey;
    console.log('[SDKD]: constructor()');
    let w = Wallet.generate();
    console.log('wallet address: '+w.getAddressString());
  }
  generateWallet(email){
    console.log('[SDKD]: generateWallet('+email+')');
  }
}