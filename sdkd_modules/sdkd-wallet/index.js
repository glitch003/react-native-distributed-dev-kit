import { SDKD_WALLET_ETH_NODE_HOST } from 'react-native-dotenv'

import * as Keychain from 'react-native-keychain'
import QRCode from 'react-native-qrcode'
import React from 'react'
import {
  View
} from 'react-native'

import BigNumber from 'bignumber.js'

// crypto and ethutils
import crypto from 'react-native-crypto'
import ethUtil from 'ethereumjs-util'
import txUtil from 'ethereumjs-tx'

// stuff from MEW
import ethFuncs from './etherwallet/ethFuncs'
import globalFuncs from './etherwallet/globalFuncs'
import etherUnits from './etherwallet/etherUnits'

// sdkd deps
import SDKDSSSS from '@sdkd/sdkd-ssss'
import SDKDAwsSes from '@sdkd/sdkd-aws-ses'

// 24 word recovery phrase
import bip39 from 'bip39'

// to create qr code data url
import { default as qrgen } from 'yaqrcode'

// for qr code acct recovery
import Camera from 'react-native-camera'

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
      ethNodeHost: SDKD_WALLET_ETH_NODE_HOST
    }
    if (config !== undefined) {
      this.debug = config.debug
    }
    this._debugLog('[SDKDWallet]: new Wallet(' + JSON.stringify(config) + ')')
    this.ajaxReq = new AjaxReq({debug: this.debug})
    this.ready = false
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
            this.ready = true
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
              this.ready = true
              resolve()
            } else {
              // upload key part since it includes the address and we need that for future auths
              this._uploadKeyPart('<RecoveryPhraseChosen>')
              // resolve with recovery mnemonic, and priv key is never exposed again
              let { privKey } = privates.get(this)
              privKey = privKey.toString('hex')
              let mnemonic = bip39.entropyToMnemonic(privKey)
              this.ready = true
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
    return new Promise((resolve, reject) => {
      this._authenticateUser()
      .then(() => {
        this.ready = true
        resolve()
      })
    })
  }

  renderRecoveryQRScanner (cb) {
    // scan the qr code
    return (
      <View style={{
        flex: 1,
        flexDirection: 'row'
      }}>
        <Camera
          ref={(cam) => {
            this.camera = cam
            this.barcodeRead = false
          }}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            alignItems: 'center'
          }}
          onBarCodeRead={this._recoveryQRScanned.bind(this, cb)}
          barCodeTypes={['qr']}
          aspect={Camera.constants.Aspect.fill}
        />
      </View>
    )
  }

  // private

  _recoveryQRScanned (cb, data) {
    this._debugLog('[SDKDWallet]: _recoveryQRScanned data:')
    if (this.barcodeRead) {
      return
    }
    this._debugLog('Barcode read: ')
    this._debugLog(data)
    this.barcodeRead = true
    // example data:
    // { type: 'QR_CODE',
    //   data: '{"email":"cvcassano@gmail.com","api_client_id":"5df26465-ed6a-41da-9fb9-5d35953f88d0","part":"8010a7ce37395081199411d8c60cb8e313ce69cb7d4b15e321afdf6f20c926766c15a","signedEmail":{"r":"e8308a4f8092bf75d52c753ded84592bcbbe627ab123be66324a1efa1ad5080e","s":"5cbc10bb8a62f9444cae5193db6ed0e406fe31b561f18691d5d564761b080c34","v":"1b"}}'
    // }
    data = JSON.parse(data.data)

    // set email address for instance
    this.email = data.email

    let localPart = data.part
    // send everything but localPart to server
    let sendToServer = {
      email: data.email,
      api_client_id: data.api_client_id,
      signedEmail: data.signedEmail
    }

    // get part from server
    fetch(global.sdkdConfig.sdkdHost + '/user_key_parts/recover', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey
      },
      body: JSON.stringify(sendToServer)
    })
    .then(response => response.json())
    .then(response => {
      this._debugLog('[SDKDWallet]: got recovery part')
      let remotePart = response.part
      // combine remotePart and localPart
      let s = new SDKDSSSS()
      let shares = [localPart, remotePart]
      let combined = s.combineShares(shares)
      let privKey = Buffer.from(combined, 'hex')
      this._storePrivateVar('privKey', privKey)
      // hurray, we recovered their wallet
      this._debugLog('[SDKDWallet]: recovered, eth address is ' + this.getAddressString())
      this._saveWallet()
      this._authenticateUser()
      .then(() => {
        this.ready = true
        cb()
      })
    })
  }

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
    .setInternetCredentials(this._keychainKey(), this.email, privKey)
    .then(() => {
      this._debugLog('Credentials saved successfully!')
    })
  }

  _sendWalletRecoveryParts () {
    this._debugLog('[SDKDWallet]: _sendWalletRecoveryParts')
    let { privKey } = privates.get(this)
    let privKeyHex = privKey.toString('hex')
    let s = new SDKDSSSS()
    let shares = s.share(privKeyHex, 2, 2)
    // sanity check - test that they can be recombined
    let combined = s.combineShares(shares)
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
    // pull out api keu id so we can encode it in the qr code
    let apiKeyPayload = JSON.parse(Buffer.from(global.sdkdConfig.unsignedApiKey, 'base64').toString())
    // create qr code image to embed in email
    let qrData = JSON.stringify({
      email: this.email,
      api_client_id: apiKeyPayload.api_client_id,
      part: part,
      signedEmail: this._signWithPrivateKey(this.email)
    })
    let url = qrgen(qrData)
    let body = 'Your recovery key is ' + part
    this._sendEmail(this.email, 'Your recovery key for SDKD', body, [url])
    this._debugLog('emailed key part 0')
  }

  async _sendEmail (to, subject, body, attachments) {
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
    // this._debugLog('got aws keys: ' + JSON.stringify(awsKey))
    let sender = new SDKDAwsSes({
      credentials: {
        accessKeyId: awsKey.credentials.access_key_id,
        secretAccessKey: awsKey.credentials.secret_access_key,
        sessionToken: awsKey.credentials.session_token
      },
      debug: false
    })
    sender.sendMessage(to, 'recovery@sdkd.co', subject, body, attachments)
    .then(response => {
      this._debugLog('email sent with response: ' + response)
    })
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
    let nonce = crypto.randomBytes(4).toString('hex')
    let payload = nonce + '_' + this.email

    let signedEmail = this._signWithPrivateKey(payload)

    return {
      signature: signedEmail,
      payload: payload,
      email: this.email,
      nonce: nonce
    }
  }

  _signWithPrivateKey (payload) {
    let { privKey } = privates.get(this)

    let msgHash = ethUtil.hashPersonalMessage(Buffer.from(payload))
    let signedData = ethUtil.ecsign(msgHash, privKey)

    // sanity check - make sure it's valid
    if (!ethUtil.isValidSignature(signedData.v, signedData.r, signedData.s)) {
      throw new Error('Could not validate signature just generated to auth user')
    }

    // sanity check - get the pub key out
    let pubKey = ethUtil.ecrecover(msgHash, signedData.v, signedData.r, signedData.s)
    let address = '0x' + ethUtil.publicToAddress(pubKey).toString('hex')
    if (address !== this.getAddressString()) {
      throw new Error('Address derived from public key retrieved from user auth signature does not match wallet address')
    }

    // convert signedData stuff to hex
    signedData.s = signedData.s.toString('hex')
    signedData.r = signedData.r.toString('hex')
    signedData.v = signedData.v.toString(16)

    return signedData
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
