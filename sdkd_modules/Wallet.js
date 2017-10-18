import '../shim.js';
import * as Keychain from 'react-native-keychain';
import QRCode from 'react-native-qrcode';
import React from 'react';


import BigNumber from 'bignumber.js';

// crypto and ethutils
import crypto from 'crypto';
import ethUtil from 'ethereumjs-util';
import txUtil from 'ethereumjs-tx';

// for backwards compatibility with MEW
ethUtil.crypto = crypto;
ethUtil.Tx = txUtil;


// stuff from MEW
import ethFuncs from './etherwallet/ethFuncs';
import globalFuncs from './etherwallet/globalFuncs';
import etherUnits from './etherwallet/etherUnits';

const ETHERSCAN_HOST = "https://ropsten.etherscan.io";
const ETHERSCAN_API_KEY = "MJRID568UADAJ8AJGC6ZVFABQ5V86DHM49";
const NODE_URL = 'https://api.myetherapi.com/rop';

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
    console.log('getting balance, addr string is '+this.getAddressString());
    return AjaxReq.getBalance(this.getAddressString());
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

  sendTx(to, value){
    let { privKey } = privates.get(this);

    // try generating a txn
    let txData = {
      to: to,
      value: value,
      data: '',
      gasLimit: 21000,
      unit: 'wei',
      from: this.getAddressString(),
      privKey: privKey,
      isOffline: true
    }

    return new Promise((resolve, reject) => {
      try {
        this._isTxDataValid(txData);
        AjaxReq.getTransactionData(txData.from)
        .then((data) => {
          console.log('got txn data');
          console.log(data);
          if (data.error) {
            reject(data.msg);
          } else {
            data = data.data;
            data.isOffline = txData.isOffline ? txData.isOffline : false;
            var rawTx = {
              nonce: ethFuncs.sanitizeHex(data.nonce),
              gasPrice: data.isOffline ? ethFuncs.sanitizeHex(data.gasprice) : ethFuncs.sanitizeHex(ethFuncs.addTinyMoreToGas(data.gasprice)),
              gasLimit: ethFuncs.sanitizeHex(ethFuncs.decimalToHex(txData.gasLimit)),
              to: ethFuncs.sanitizeHex(txData.to),
              value: ethFuncs.sanitizeHex(ethFuncs.decimalToHex(etherUnits.toWei(txData.value, txData.unit))),
              data: ethFuncs.sanitizeHex(txData.data)
            }
            var eTx = new ethUtil.Tx(rawTx);
            eTx.sign(txData.privKey);
            rawTx.rawTx = JSON.stringify(rawTx);
            rawTx.signedTx = '0x' + eTx.serialize().toString('hex');
            rawTx.isError = false;
            return rawTx;
          }
        })
        .then((rawTx) => {
          // tx is assembled, send signed tx
          AjaxReq.sendRawTx(rawTx.signedTx)
          .then((data) => {
            console.log('sent raw tx');
            console.log(data);
            var resp = {};
            if (data.error) {
                reject(data.msg);
            } else {
                resolve(data.data);
            }
          });
        })
      } catch (e) {
        reject(e);
      }
    });
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

  // borrowed from MEW
  _isTxDataValid(txData) {
    if (txData.to != "0xCONTRACT" && !ethFuncs.validateEtherAddress(txData.to)) throw globalFuncs.errorMsgs[5];
    else if (!globalFuncs.isNumeric(txData.value) || parseFloat(txData.value) < 0) throw globalFuncs.errorMsgs[0];
    else if (!globalFuncs.isNumeric(txData.gasLimit) || parseFloat(txData.gasLimit) <= 0) throw globalFuncs.errorMsgs[8];
    else if (!ethFuncs.validateHexString(txData.data)) throw globalFuncs.errorMsgs[9];
    if (txData.to == "0xCONTRACT") txData.to = '';
  }
}

class AjaxReq {
  static getRandomID(){
    return ethUtil.crypto.randomBytes(16).toString('hex');
  }

  static sendRawTx(signedTx){
    return new Promise((resolve, reject) => {
      let data = {
        id: this.getRandomID(),
        jsonrpc: '2.0'
      }
      fetch(NODE_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: this.getRandomID(),
          method: 'eth_sendRawTransaction',
          params: [signedTx]
        })
      })
      .then(response => response.json())
      .then(response => {
        if (response.error) reject(response.error.message);
        else resolve(response);
      })
    })
  }

  static getTransactionData(addr){
    var response = { error: false, msg: '', data: { address: addr, balance: '', gasprice: '', nonce: '' } };
    var reqObj = [
        { "id": this.getRandomID(), "jsonrpc": "2.0", "method": "eth_getBalance", "params": [addr, 'pending'] },
        { "id": this.getRandomID(), "jsonrpc": "2.0", "method": "eth_gasPrice", "params": [] },
        { "id": this.getRandomID(), "jsonrpc": "2.0", "method": "eth_getTransactionCount", "params": [addr, 'pending'] }
    ];
    return new Promise((resolve, reject) => {
      fetch(NODE_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reqObj)
      })
      .then(response => response.json())
      .then(data => {
        console.log('got txn data: ');
        console.log(data);
        for (var i in data) {
          if (data[i].error) {
            reject(data[i].error.message);
            return;
          }
        }
        response.data.balance = new BigNumber(data[0].result).toString();
        response.data.gasprice = data[1].result;
        response.data.nonce = data[2].result;
        resolve(response);
      })
    })
  }

  static getBalance(addr){
    return new Promise((resolve, reject) => {
      fetch(NODE_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: this.getRandomID(),
          method: 'eth_getBalance',
          params: [addr, 'pending']
        })
      })
      .then(response => response.json())
      .then(response => {
        console.log('got balance data: ');
        console.log(response);
        if (response.error) reject(response.error.message);
        else resolve(new BigNumber(response.result).toString());
      })
    })
  }
}
