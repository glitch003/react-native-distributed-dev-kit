import Wallet from './myetherwallet.js';

export default class SDKD {
  constructor(apiKey){
    this.apiKey = apiKey;
    console.log('[SDKD]: constructor()');
  }
  generateWallet(email){
    console.log('[SDKD]: generateWallet('+email+')');
    this.wallet = Wallet.generate();
    console.log('wallet address: '+this.wallet.getAddressString());
  }
}