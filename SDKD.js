import Wallet from './myetherwallet';
import * as Keychain from 'react-native-keychain';

export default class SDKD {

  constructor(apiKey){
    this.apiKey = apiKey;
    console.log('[SDKD]: constructor()');
  }

  generateWallet(email){
    console.log('[SDKD]: generateWallet('+email+')');
    this.email = email;
    // check if user already has a wallet
    return new Promise((resolve, reject) => {
      Keychain
      .getInternetCredentials(this._keychainKey())
      .then((credentials) => {
        // return our own promise
        
        if (credentials) {
          console.log('Credentials successfully loaded for address ' + credentials.username);
          this.wallet = new Wallet(credentials.password);
        }else{
          // create new wallet
          this.wallet = Wallet.generate();
          this._saveWallet();
        }
        console.log('wallet address: ' + this.wallet.getAddressString());
        resolve();
      });
    });
  }

  getBalance(){
    return new Promise((resolve, reject) => {
      this.wallet.setBalance(() => resolve(this.wallet.getBalance()));
    })
  }

  // private

  _saveWallet(){
    Keychain
    .setInternetCredentials(this._keychainKey(), this.wallet.getAddressString(), this.wallet.getPrivateKeyString())
    .then(function() {
      console.log('Credentials saved successfully!');
    });
  }

  _keychainKey(){
    return 'sdkd_private_key_for_'+this.email;
  }
}