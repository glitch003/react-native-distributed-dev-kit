import Wallet from './myetherwallet';

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

  getBalance(callback){
    this.wallet.setBalance(() => callback(this.wallet.getBalance()));
  }
}