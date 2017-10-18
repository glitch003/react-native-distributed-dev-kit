import '../shim.js';
import * as Keychain from 'react-native-keychain';
import QRCode from 'react-native-qrcode';
import React from 'react';

// crypto and ethutils
import crypto from 'crypto';
var ethUtil = require('ethereumjs-util');
ethUtil.crypto = crypto;

const ETHERSCAN_HOST = "https://ropsten.etherscan.io";
const ETHERSCAN_API_KEY = "MJRID568UADAJ8AJGC6ZVFABQ5V86DHM49";

const privates = new WeakMap();

export class Wallet {
  constructor(apiKey){
    this.apiKey = apiKey;
  }

  activate(email){
    console.log('[SDKD]: Wallet.activate('+email+')');
    this.email = email;
    // check if user already has a wallet
    return new Promise((resolve, reject) => {
      Keychain
      .getInternetCredentials(this._keychainKey())
      .then((credentials) => {
        if (credentials) {
          console.log('Credentials successfully loaded for address ' + credentials.username);
          this._storePrivateVar('privKey', Buffer(credentials.password, 'hex'));
        }else{
          // create new wallet
          this._newPrivateKey();
          this._saveWallet();
        }
        console.log('wallet address: ' + this.getAddressString());
        resolve();
      });
    });
  }



  getPublicKey() {
      let { privKey } = privates.get(this);
      return ethUtil.privateToPublic(privKey);
  }
  getPublicKeyString() {
      return '0x' + this.getPublicKey().toString('hex');
  }
  getAddress() {
    let { privKey } = privates.get(this);
    return ethUtil.privateToAddress(privKey);
  }
  getAddressString() {
      return '0x' + this.getAddress().toString('hex')
  }
  getChecksumAddressString() {
      return ethUtil.toChecksumAddress(this.getAddressString())
  }
  getBalance() {
    return new Promise((resolve, reject) => {
      fetch(ETHERSCAN_HOST + '/api?module=account&action=balance&address=' + this.getAddressString() + '&tag=latest&apikey=' + ETHERSCAN_API_KEY, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      })
      .then(response => response.json())
      .then(response => {
        console.log(response);
        this.balance = response.result;
        resolve(this.balance);
      })
    })
  }

  renderAddressQRCode(){
    return (
      <QRCode
        value={this.getAddressString()}
        size={200}
        bgColor='black'
        fgColor='white'/>
    );
  }

  // private

  _newPrivateKey(){
    let privKey = ethUtil.crypto.randomBytes(32);
    this._storePrivateVar('privKey', privKey);
  }


  _saveWallet(){
    let { privKey } = privates.get(this);
    privKey = privKey.toString('hex');
    Keychain
    .setInternetCredentials(this._keychainKey(), this.getAddressString(), privKey)
    .then(function() {
      console.log('Credentials saved successfully!');
    });
  }

  _keychainKey(){
    return 'sdkd_private_key_for_'+this.email;
  }

  _storePrivateVar(key, value){
    let existingPrivates = privates.get(this);
    if(existingPrivates === undefined){
      existingPrivates = {}
    }
    existingPrivates[key] = value;
    privates.set(this, existingPrivates);
  }
}
