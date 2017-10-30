import * as Keychain from 'react-native-keychain'
import QRCode from 'react-native-qrcode'
import React from 'react'

import BigNumber from 'bignumber.js'

// crypto and ethutils
import crypto from 'react-native-crypto'
import ethUtil from 'ethereumjs-util'
import txUtil from 'ethereumjs-tx'

// stuff from MEW
import ethFuncs from './etherwallet/ethFuncs'
import globalFuncs from './etherwallet/globalFuncs'
import etherUnits from './etherwallet/etherUnits'

import AwsSigner from './utils/AwsSigner'
import SSSS from './utils/SSSS'

// 24 word recovery phrase
import bip39 from 'bip39'

// for backwards compatibility with MEW
ethUtil.crypto = crypto
ethUtil.Tx = txUtil

const privates = new WeakMap()

export default class SDKDWallet {
  constructor (config) {
    if (global.sdkdConfig === undefined) {
      throw new Error('You must run SDKDConfig.init before using any SDKD modules')
    }
    global.sdkdConfig.moduleConfig.wallet = {
      ethNodeHost: 'https://api.myetherapi.com/rop'
    }
    if (config !== undefined) {
      this.debug = config.debug
    }
    this._debugLog('[SDKDWallet]: new Wallet(' + JSON.stringify(config) + ')')
    this.ajaxReq = new AjaxReq({debug: this.debug})
  }

  // config object:
  // {
  //   "email": (Required) <the user's email address>,
  //   "recoveryType": (Optional) <one of either "email" for 2 factor email recovery or "phrase" for 24 word passphrase
  // }
  activate (config) {
    this._debugLog('[SDKDWallet]: Wallet.activate(' + JSON.stringify(config) + ')')
    this.email = config.email
    // check if user already has a wallet
    return new Promise((resolve, reject) => {
      Keychain
      .getInternetCredentials(this._keychainKey())
      .then((credentials) => {
        if (credentials) {
          this._debugLog('[SDKDWallet]: Credentials successfully loaded for email ' + credentials.username)
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
            if (config.recoveryType === undefined || config.recoveryType === 'email') {
              this._sendWalletRecoveryParts()
              resolve()
            } else {
              // upload key part since it includes the address and we need that for future auths
              this._uploadKeyPart('<RecoveryPhraseChosen>')
              // resolve with recovery mnemonic, and priv key is never exposed again
              let { privKey } = privates.get(this)
              privKey = privKey.toString('hex')
              let mnemonic = bip39.entropyToMnemonic(privKey)
              resolve(mnemonic)
            }
          })
        }
      })
      .catch(err => reject(err))
    })
  }

  getPublicKey () {
    this._debugLog('[SDKDWallet]: getPublicKey')
    let { privKey } = privates.get(this)
    return ethUtil.privateToPublic(privKey)
  }
  getPublicKeyString () {
    this._debugLog('[SDKDWallet]: getPublicKeyString')
    return '0x' + this.getPublicKey().toString('hex')
  }
  getAddress () {
    this._debugLog('[SDKDWallet]: getAddress')
    let { privKey } = privates.get(this)
    return ethUtil.privateToAddress(privKey)
  }
  getAddressString () {
    this._debugLog('[SDKDWallet]: getAddressString')
    return '0x' + this.getAddress().toString('hex')
  }
  getChecksumAddressString () {
    this._debugLog('[SDKDWallet]: getChecksumAddressString')
    return ethUtil.toChecksumAddress(this.getAddressString())
  }
  getBalance () {
    this._debugLog('[SDKDWallet]: getBalance, addr string is ' + this.getAddressString())
    return this.ajaxReq.getBalance(this.getAddressString())
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
    this._debugLog('[SDKDWallet]: sendTx')
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
        this.ajaxReq.getTransactionData(txData.from)
        .then((data) => {
          this._debugLog('got txn data')
          this._debugLog(data)
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
          this.ajaxReq.sendRawTx(rawTx.signedTx)
          .then((data) => {
            this._debugLog('sent raw tx')
            this._debugLog(data)
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

  activateFromRecoveryPhrase (email, phrase) {
    this.email = email
    let hexPrivKey = bip39.mnemonicToEntropy(phrase)
    let privKey = Buffer.from(hexPrivKey, 'hex')
    this._storePrivateVar('privKey', privKey)
    this._saveWallet()
    return this._authenticateUser()
  }

  // private

  _authenticateUser () {
    this._debugLog('[SDKDWallet]: _authenticateUser')
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
        this._debugLog(response)
        if (response.error) {
          reject(response.error)
        }
        // save JWT
        global.sdkdConfig.currentUserKey = response.jwt
        this._debugLog(response)
        resolve(response.jwt)
      })
      .catch(err => { reject(err) })
    })
  }

  _newPrivateKey () {
    this._debugLog('[SDKDWallet]: _newPrivateKey')
    let privKey = ethUtil.crypto.randomBytes(32)
    this._storePrivateVar('privKey', privKey)
  }

  _saveWallet () {
    this._debugLog('[SDKDWallet]: _saveWallet')
    let { privKey } = privates.get(this)
    privKey = privKey.toString('hex')
    Keychain
    .setInternetCredentials(this._keychainKey(), privKey)
    .then(function () {
      this._debugLog('Credentials saved successfully!')
    })
  }

  _sendWalletRecoveryParts () {
    this._debugLog('[SDKDWallet]: _sendWalletRecoveryParts')
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
    this._debugLog('[SDKDWallet]: _emailKeyPart')
    let body = 'Your recovery key is ' + part
    this._sendEmail(this.email, 'Your recovery key for SDKD', body)
    this._debugLog('emailed key part 0')
  }

  _uploadKeyPart (part) {
    this._debugLog('[SDKDWallet]: _uploadKeyPart')
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
      this._debugLog(response)
      if (response.error) {
        throw new Error(response.error)
      }
      this._debugLog('uploaded key part 1')
    })
    .catch(err => { throw new Error(err) })
  }

  async _sendEmail (to, subject, body) {
    // get aws key and token and stuff
    let awsKey = await fetch(global.sdkdConfig.sdkdHost + '/modules/wallet_aws_token', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey,
        'X-SDKD-User-Key': global.sdkdConfig.currentUserKey
      }
    })
    .then(response => response.json())
    this._debugLog('got aws keys: ' + JSON.stringify(awsKey))

    // Example value for awsKey variable
    // {
    //     "credentials": {
    //         "access_key_id": "ASIAJMXUGPAIWXTPDKSA",
    //         "secret_access_key": "X36y+jYtcoj+x56rSVxP+gxQj7OL5DPI5qhqgstc",
    //         "session_token": "FQoDYXdzEDkaDFGTiroTyim0atHmcSKcAh7zdzDLEFNFAAcdbcf7LW2up9iOAOw14Xivu+tGXBw4BS8VVgI1HtOsbGi+HKpoPMx2vKiKBlKqsUS3xKh1lzSEhr2pJ+Sbsoz1zb8XZXq2WHFyRN4eGb8JJnHe1dsra5+UrNDN04hVFX1V7Qbmry9gAH8cBIogLsmVVN2bZVMILs8eUW2xsvh2ak/nm66Lq/3vlmwwInJ5511XsAI/gRlUX/e73ndVak8SX3oodfXXU0N/vcKiAg3Hmc/mFJC2P484WjzMQLP9BSsjcC8DLpUJuPSi/kEfVmjsWfcZaIRziOcIcqTwgm2Awc0pPnIflaNbdXAazQaZMdzJ+skNWxVREcDbRmUl+Y0r1KGKtlZB7KkLr68Kb3raFH7OKIubv88F",
    //         "expiration": "2017-10-24T23:47:27.000Z"
    //     },
    //     "federated_user": {
    //         "federated_user_id": "451848815792:ses",
    //         "arn": "arn:aws:sts::451848815792:federated-user/ses"
    //     },
    //     "packed_policy_size": 21
    // }

    let config = {
      region: 'us-east-1',
      service: 'email',
      accessKeyId: awsKey.credentials.access_key_id,
      secretAccessKey: awsKey.credentials.secret_access_key,
      sessionToken: awsKey.credentials.session_token
    }
    let signer = new AwsSigner(config)
    let postBodyObj = {
      'Action': 'SendEmail',
      'Source': 'recovery@sdkd.co',
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
    this._debugLog(request)
    var signed = signer.sign(request)
    this._debugLog('signed request: ')
    this._debugLog(signed)
    fetch('https://email.us-east-1.amazonaws.com', {
      method: 'POST',
      headers: signed,
      body: postBody
    })
    .then(response => this._debugLog(response))
    .catch(err => { throw new Error(err) })
  }

  _registerUser () {
    this._debugLog('[SDKDWallet]: _registerUser')
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
        this._debugLog(response)
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

  _debugLog (toLog) {
    if (this.debug === true) {
      console.log(toLog)
    }
  }

  _signEmailForAuth () {
    this._debugLog('[SDKDWallet]: _signEmailForAuth')
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
    this._debugLog('[SDKDWallet]: _storePrivateVar')
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
  constructor (config) {
    if (config !== undefined) {
      this.debug = config.debug
    }
  }
  getRandomID () {
    return ethUtil.crypto.randomBytes(16).toString('hex')
  }

  sendRawTx (signedTx) {
    return new Promise((resolve, reject) => {
      fetch(global.sdkdConfig.moduleConfig.wallet.ethNodeHost, {
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

  getTransactionData (addr) {
    var response = { error: false, msg: '', data: { address: addr, balance: '', gasprice: '', nonce: '' } }
    var reqObj = [
        { 'id': this.getRandomID(), 'jsonrpc': '2.0', 'method': 'eth_getBalance', 'params': [addr, 'pending'] },
        { 'id': this.getRandomID(), 'jsonrpc': '2.0', 'method': 'eth_gasPrice', 'params': [] },
        { 'id': this.getRandomID(), 'jsonrpc': '2.0', 'method': 'eth_getTransactionCount', 'params': [addr, 'pending'] }
    ]
    return new Promise((resolve, reject) => {
      fetch(global.sdkdConfig.moduleConfig.wallet.ethNodeHost, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reqObj)
      })
      .then(response => response.json())
      .then(data => {
        this._debugLog('got txn data: ')
        this._debugLog(data)
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

  getBalance (addr) {
    return new Promise((resolve, reject) => {
      fetch(global.sdkdConfig.moduleConfig.wallet.ethNodeHost, {
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
        this._debugLog('got balance data: ')
        this._debugLog(response)
        if (response.error) reject(response.error.message)
        else resolve(new BigNumber(response.result).toString())
      })
      .catch(err => reject(err))
    })
  }

  _debugLog (toLog) {
    if (this.debug === true) {
      console.log(toLog)
    }
  }
}
