import './shim.js';
import crypto from 'crypto';


export default class SDKD {
  constructor(apiKey){
    this.apiKey = apiKey;
    console.log('[SDKD]: constructor()');
    console.log(crypto.randomBytes(32));
  }
  generateWallet(email){
    console.log('[SDKD]: generateWallet('+email+')');
  }
}