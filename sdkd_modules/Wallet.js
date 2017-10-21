import '../shim.js'
import * as Keychain from 'react-native-keychain'
import QRCode from 'react-native-qrcode'
import React from 'react'

import BigNumber from 'bignumber.js'

// crypto and ethutils
import crypto from 'crypto'
import ethUtil from 'ethereumjs-util'
import txUtil from 'ethereumjs-tx'

// stuff from MEW
import ethFuncs from './etherwallet/ethFuncs'
import globalFuncs from './etherwallet/globalFuncs'
import etherUnits from './etherwallet/etherUnits'

import AwsSigner from './utils/AwsSigner'
import SSSS from './utils/SSSS'

// for backwards compatibility with MEW
ethUtil.crypto = crypto
ethUtil.Tx = txUtil

const NODE_URL = 'https://api.myetherapi.com/rop'
const SDKD_HOST = 'https://sdk-d.herokuapp.com'

const privates = new WeakMap()

export class Wallet {
  constructor (apiKey) {
    this.apiKey = apiKey
  }

  activate (email) {
    console.log('[SDKD]: Wallet.activate(' + email + ')')
    this.email = email
    // check if user already has a wallet
    return new Promise((resolve, reject) => {
      Keychain
      .getInternetCredentials(this._keychainKey())
      .then((credentials) => {
        if (credentials) {
          console.log('Credentials successfully loaded for address ' + credentials.username)
          this._storePrivateVar('privKey', Buffer.from(credentials.password, 'hex'))
          this._authenticateUser()
          .then(jwt => {
            resolve()
          })
        } else {
          // create new wallet
          this._registerUser()
          .then(jwt => {
            this._newPrivateKey()
            this._saveWallet()
            this._sendWalletRecoveryParts()
            resolve()
          })
        }
        console.log('wallet address: ' + this.getAddressString())
      })
      .catch(err => reject(err))
    })
  }

  getPublicKey () {
    let { privKey } = privates.get(this)
    return ethUtil.privateToPublic(privKey)
  }
  getPublicKeyString () {
    return '0x' + this.getPublicKey().toString('hex')
  }
  getAddress () {
    let { privKey } = privates.get(this)
    return ethUtil.privateToAddress(privKey)
  }
  getAddressString () {
    return '0x' + this.getAddress().toString('hex')
  }
  getChecksumAddressString () {
    return ethUtil.toChecksumAddress(this.getAddressString())
  }
  getBalance () {
    console.log('getting balance, addr string is ' + this.getAddressString())
    return AjaxReq.getBalance(this.getAddressString())
  }

  renderAddressQRCode () {
    return (
      <QRCode
        value={this.getAddressString()}
        size={200}
        bgColor='black'
        fgColor='white' />
    )
  }

  sendTx (to, value) {
    let { privKey } = privates.get(this)

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
        this._isTxDataValid(txData)
        AjaxReq.getTransactionData(txData.from)
        .then((data) => {
          console.log('got txn data')
          console.log(data)
          if (data.error) {
            reject(data.msg)
          } else {
            data = data.data
            data.isOffline = txData.isOffline ? txData.isOffline : false
            var rawTx = {
              nonce: ethFuncs.sanitizeHex(data.nonce),
              gasPrice: data.isOffline ? ethFuncs.sanitizeHex(data.gasprice) : ethFuncs.sanitizeHex(ethFuncs.addTinyMoreToGas(data.gasprice)),
              gasLimit: ethFuncs.sanitizeHex(ethFuncs.decimalToHex(txData.gasLimit)),
              to: ethFuncs.sanitizeHex(txData.to),
              value: ethFuncs.sanitizeHex(ethFuncs.decimalToHex(etherUnits.toWei(txData.value, txData.unit))),
              data: ethFuncs.sanitizeHex(txData.data)
            }
            var eTx = new ethUtil.Tx(rawTx)
            eTx.sign(txData.privKey)
            rawTx.rawTx = JSON.stringify(rawTx)
            rawTx.signedTx = '0x' + eTx.serialize().toString('hex')
            rawTx.isError = false
            return rawTx
          }
        })
        .then((rawTx) => {
          // tx is assembled, send signed tx
          AjaxReq.sendRawTx(rawTx.signedTx)
          .then((data) => {
            console.log('sent raw tx')
            console.log(data)
            if (data.error) {
              reject(data.msg)
            } else {
              resolve(data.data)
            }
          })
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  // private

  _authenticateUser () {
    let sig = this._signEmailForAuth()
    return new Promise((resolve, reject) => {
      fetch(global.sdkdConfig.sdkdHost + '/sessions', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey
        },
        body: JSON.stringify(sig)
      })
      .then(response => response.json())
      .then(response => {
        console.log(response)
        if (response.error) {
          reject(response.error)
        }
        // save JWT
        global.sdkdConfig.currentUserKey = response.jwt
        console.log(response)
        resolve(response.jwt)
      })
      .catch(err => { reject(err) })
    })
  }

  _newPrivateKey () {
    let privKey = ethUtil.crypto.randomBytes(32)
    this._storePrivateVar('privKey', privKey)
  }

  _saveWallet () {
    let { privKey } = privates.get(this)
    privKey = privKey.toString('hex')
    Keychain
    .setInternetCredentials(this._keychainKey(), this.getAddressString(), privKey)
    .then(function () {
      console.log('Credentials saved successfully!')
    })
  }

  _sendWalletRecoveryParts () {
    let { privKey } = privates.get(this)
    let privKeyHex = privKey.toString('hex')
    let s = new SSSS()
    let shares = s.share(privKeyHex, 2, 2)
    // sanity check - test that they can be recombined
    let combined = s.combine(0, shares)
    if (combined !== privKeyHex) {
      throw new Error('Something is wrong with sending the recovery key.  Recovery key parts could not be reassembled.')
    }
    // sanity check - make sure that there are 2 shares
    if (shares.length !== 2) {
      throw new Error('Something is wrong with sending the recovery key.  There are not exactly 2 shares')
    }
    this._emailKeyPart(shares[0])
    this._uploadKeyPart(shares[1])
  }

  _emailKeyPart (part) {
    let body = 'Your recovery key is ' + part
    this._sendEmail(this.email, 'Your recovery key for SDKD', body)
    console.log('emailed key part 0')
  }

  _uploadKeyPart (part) {
    fetch(global.sdkdConfig.sdkdHost + '/user_key_parts', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey,
        'X-SDKD-User-Key': global.sdkdConfig.currentUserKey
      },
      body: JSON.stringify({
        address: this.getAddressString(),
        part: part
      })
    })
    .then(response => response.json())
    .then(response => {
      console.log(response)
      if (response.error) {
        throw new Error(response.error)
      }
      console.log('uploaded key part 1')
    })
    .catch(err => { throw new Error(err) })
  }

  _sendEmail (to, subject, body) {
    let config = {
      region: 'us-east-1',
      service: 'email',
      accessKeyId: 'AKIAJF7NL4FDKNDHE55Q',
      secretAccessKey: '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'
    }
    let signer = new AwsSigner(config)
    let postBodyObj = {
      'Action': 'SendEmail',
      'Source': 'chris@sdkd.co',
      'Destination.ToAddresses.member.1': to,
      'Message.Subject.Data': subject,
      'Message.Body.Text.Data': body
    }
    let postBody = Object.keys(postBodyObj)
    .map(k => k + '=' + encodeURIComponent(postBodyObj[k]))
    .join('&')

    // Sign a request
    var request = {
      method: 'POST',
      url: 'https://email.us-east-1.amazonaws.com',
      body: postBody
    }
    console.log(request)
    var signed = signer.sign(request)
    console.log('signed request: ')
    console.log(signed)
    fetch('https://email.us-east-1.amazonaws.com', {
      method: 'POST',
      headers: signed,
      body: postBody
    })
    .then(response => console.log(response))
    .catch(err => { throw new Error(err) })
  }

  _registerUser () {
    console.log('registering user')
    // register the user
    return new Promise((resolve, reject) => {
        fetch(global.sdkdConfig.sdkdHost + '/users', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey
        },
        body: JSON.stringify({
          email: this.email
        })
      })
      .then(response => response.json())
      .then(response => {
        console.log(response)
        if (response.error) {
          reject(response.error)
        }
        // save JWT
        global.sdkdConfig.currentUserKey = response.jwt
        resolve(response.jwt)
      })
      .catch(err => { reject(err) })
    })
  }

  _signEmailForAuth () {
    let { privKey } = privates.get(this)

    let nonce = crypto.randomBytes(4).toString('hex')
    let payload = nonce + '_' + this.email
    let msgHash = ethUtil.hashPersonalMessage(Buffer.from(payload))
    let signedEmail = ethUtil.ecsign(msgHash, privKey)

    // sanity check - make sure it's valid
    if (!ethUtil.isValidSignature(signedEmail.v, signedEmail.r, signedEmail.s)) {
      throw new Error('Could not validate signature just generated to auth user')
    }

    // sanity check - get the pub key out
    let pubKey = ethUtil.ecrecover(msgHash, signedEmail.v, signedEmail.r, signedEmail.s)
    let address = '0x' + ethUtil.publicToAddress(pubKey).toString('hex')
    if (address !== this.getAddressString()) {
      throw new Error('Address derived from public key retrieved from user auth signature does not match wallet address')
    }

    // convert signedEmail stuff to hex
    signedEmail.s = signedEmail.s.toString('hex')
    signedEmail.r = signedEmail.r.toString('hex')
    signedEmail.v = signedEmail.v.toString(16)

    return {
      signature: signedEmail,
      payload: payload,
      email: this.email,
      nonce: nonce
    }
  }

  _keychainKey () {
    return 'sdkd_private_key_for_' + this.email
  }

  _storePrivateVar (key, value) {
    let existingPrivates = privates.get(this)
    if (existingPrivates === undefined) {
      existingPrivates = {}
    }
    existingPrivates[key] = value
    privates.set(this, existingPrivates)
  }

  // borrowed from MEW
  _isTxDataValid (txData) {
    if (txData.to !== '0xCONTRACT' && !ethFuncs.validateEtherAddress(txData.to)) throw globalFuncs.errorMsgs[5]
    else if (!globalFuncs.isNumeric(txData.value) || parseFloat(txData.value) < 0) throw globalFuncs.errorMsgs[0]
    else if (!globalFuncs.isNumeric(txData.gasLimit) || parseFloat(txData.gasLimit) <= 0) throw globalFuncs.errorMsgs[8]
    else if (!ethFuncs.validateHexString(txData.data)) throw globalFuncs.errorMsgs[9]
    if (txData.to === '0xCONTRACT') txData.to = ''
  }
}

class AjaxReq {
  static getRandomID () {
    return ethUtil.crypto.randomBytes(16).toString('hex')
  }

  static sendRawTx (signedTx) {
    return new Promise((resolve, reject) => {
      fetch(global.sdkdConfig.ethNodeHost, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: this.getRandomID(),
          jsonrpc: '2.0',
          method: 'eth_sendRawTransaction',
          params: [signedTx]
        })
      })
      .then(response => response.json())
      .then(response => {
        if (response.error) reject(response.error.message)
        else resolve(response)
      })
      .catch(err => { throw new Error(err) })
    })
  }

  static getTransactionData (addr) {
    var response = { error: false, msg: '', data: { address: addr, balance: '', gasprice: '', nonce: '' } }
    var reqObj = [
        { 'id': this.getRandomID(), 'jsonrpc': '2.0', 'method': 'eth_getBalance', 'params': [addr, 'pending'] },
        { 'id': this.getRandomID(), 'jsonrpc': '2.0', 'method': 'eth_gasPrice', 'params': [] },
        { 'id': this.getRandomID(), 'jsonrpc': '2.0', 'method': 'eth_getTransactionCount', 'params': [addr, 'pending'] }
    ]
    return new Promise((resolve, reject) => {
      fetch(global.sdkdConfig.ethNodeHost, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reqObj)
      })
      .then(response => response.json())
      .then(data => {
        console.log('got txn data: ')
        console.log(data)
        for (var i in data) {
          if (data[i].error) {
            reject(data[i].error.message)
            return
          }
        }
        response.data.balance = new BigNumber(data[0].result).toString()
        response.data.gasprice = data[1].result
        response.data.nonce = data[2].result
        resolve(response)
      })
      .catch(err => reject(err))
    })
  }

  static getBalance (addr) {
    return new Promise((resolve, reject) => {
      fetch(global.sdkdConfig.ethNodeHost, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: this.getRandomID(),
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [addr, 'pending']
        })
      })
      .then(response => response.json())
      .then(response => {
        console.log('got balance data: ')
        console.log(response)
        if (response.error) reject(response.error.message)
        else resolve(new BigNumber(response.result).toString())
      })
      .catch(err => reject(err))
    })
  }
}
