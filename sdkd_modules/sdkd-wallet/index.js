import * as Keychain from 'react-native-keychain'
import QRCode from 'react-native-qrcode'
import React from 'react'
import {
  View,
  Alert
} from 'react-native'

import PushNotification from 'react-native-push-notification'

import BigNumber from 'bignumber.js'

// crypto and ethutils
import crypto from 'react-native-crypto'
import ethUtil from 'ethereumjs-util'
import txUtil from 'ethereumjs-tx'

// stuff from MEW
import ethFuncs from './etherwallet/ethFuncs'
import globalFuncs from './etherwallet/globalFuncs'
import etherUnits from './etherwallet/etherUnits'
import Validator from './etherwallet/validator'
import Ens from './etherwallet/ens'
import nodes from './etherwallet/nodes'
import solidityUtils from './etherwallet/solidity/utils'
import solidityCoder from './etherwallet/solidity/coder'
import ajaxReq from './etherwallet/ajaxReq'

// sdkd deps
import SDKDSSSS from '@sdkd/sdkd-ssss'
import SDKDAwsSes from '@sdkd/sdkd-aws-ses'

// 24 word recovery phrase
import bip39 from 'bip39'

// to create qr code data url
import { default as qrgen } from 'yaqrcode'

// for qr code acct recovery
import Camera from 'react-native-camera'

// for parsing address urls
import URLParser from 'url-parse'

// for MEW
import https from 'https-browserify'

// for backwards compatibility with MEW
ethUtil.crypto = crypto
ethUtil.Tx = txUtil
ethUtil.solidityUtils = solidityUtils
ethUtil.solidityCoder = solidityCoder
ajaxReq.type = nodes.nodeTypes.Ropsten
ajaxReq.key = 'rop_mew'
ajaxReq.http = https
ajaxReq.http.post = function (url, data, config) {
  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'POST',
      headers: config.headers,
      body: data
    })
    .then((response) => {
      return response.json()
    }).then(response => {
      console.log('response from server is ' + JSON.stringify(response))
      resolve({data: response})
    }).catch((error) => reject(error))
  })
}

// make available globally so MEW can use this stuff
global.ajaxReq = ajaxReq
global.nodes = nodes
global.ethFuncs = ethFuncs
global.ens = Ens
global.ethUtil = ethUtil
global.globalFuncs = globalFuncs
global.BigNumber = BigNumber
global.etherUnits = etherUnits

const privates = new WeakMap()

export default class SDKDWallet {
  constructor (config) {
    if (global.sdkdConfig === undefined) {
      throw new Error('You must run SDKDConfig.init before using any SDKD modules')
    }
    global.sdkdConfig.moduleConfig.wallet = {
      ethNodeHost: 'https://api.myetherapi.com/rop',
      etherscanHost: 'https://ropsten.etherscan.io'
    }
    if (config !== undefined) {
      this.debug = config.debug
      global.sdkdConfig.moduleConfig.wallet.gcmSenderId = config.gcmSenderId
    }
    this._debugLog('new Wallet(' + JSON.stringify(config) + ')')
    this.ethNodeAjaxReq = new EthNodeAjaxReq({debug: this.debug})
    this.sdkdAjaxReq = new SDKDAjaxReq({debug: this.debug})
    this.ready = false
    this.ethFuncs = ethFuncs
    this.ethUtil = ethUtil
    this.etherUnits = etherUnits
    this._configurePushNotifications()
    this._configureMEWNode()
  }

  // config object:
  // {
  //   "email": (Required) <the user's email address>,
  //   "recoveryType": (Optional) <one of either "email" for 2 factor email recovery or "phrase" for 24 word passphrase
  // }
  activate (config) {
    this._debugLog('Wallet.activate(' + JSON.stringify(config) + ')')
    this.email = config.email
    // check if user already has a wallet
    return new Promise((resolve, reject) => {
      this._debugLog('getting credentials for keychain key ' + this._keychainKey())
      Keychain
      .getInternetCredentials(this._keychainKey())
      .then((credentials) => {
        if (credentials) {
          this._debugLog('Credentials successfully loaded for email ' + credentials.username)
          this._debugLog(JSON.stringify(credentials))
          this._storePrivateVar('privKey', Buffer.from(credentials.password, 'hex'))
          this._authenticateUser()
          .then(jwt => {
            this._walletReady()
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
              this._walletReady()
              resolve()
            } else {
              // upload key part since it includes the address and we need that for future auths
              this._uploadKeyPart('<RecoveryPhraseChosen>')
              // resolve with recovery mnemonic, and priv key is never exposed again
              let { privKey } = privates.get(this)
              privKey = privKey.toString('hex')
              let mnemonic = bip39.entropyToMnemonic(privKey)
              this._walletReady()
              resolve(mnemonic)
            }
          })
        }
      })
      .catch(err => reject(err))
    })
  }

  getPublicKey () {
    this._debugLog('getPublicKey')
    let { privKey } = privates.get(this)
    return ethUtil.privateToPublic(privKey)
  }
  getPublicKeyString () {
    this._debugLog('getPublicKeyString')
    return '0x' + this.getPublicKey().toString('hex')
  }
  getAddress () {
    this._debugLog('getAddress')
    let { privKey } = privates.get(this)
    return ethUtil.privateToAddress(privKey)
  }
  getAddressString () {
    this._debugLog('getAddressString')
    return '0x' + this.getAddress().toString('hex')
  }
  getChecksumAddressString () {
    this._debugLog('getChecksumAddressString')
    return ethUtil.toChecksumAddress(this.getAddressString())
  }
  getBalance () {
    this._debugLog('getBalance, addr string is ' + this.getAddressString())
    return this.ethNodeAjaxReq.getBalance(this.getAddressString())
  }

  // pass through to sdkd ajax req class
  getNotifications () {
    return this.sdkdAjaxReq.getNotifications()
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
    this._debugLog('sendTx')
    let { privKey } = privates.get(this)

    // try generating a txn
    let txData = {
      to: to,
      value: value,
      data: '',
      gasLimit: globalFuncs.defaultTxGasLimit,
      unit: 'wei',
      from: this.getAddressString(),
      privKey: privKey,
      isOffline: true
    }

    return new Promise((resolve, reject) => {
      try {
        this._isTxDataValid(txData)
        this.ethNodeAjaxReq.getTransactionData(txData.from)
        .then((data) => {
          this._debugLog('got txn data')
          this._debugLog(JSON.stringify(data))
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
          this.ethNodeAjaxReq.sendRawTx(rawTx.signedTx)
          .then((data) => {
            this._debugLog('sent raw tx')
            this._debugLog(JSON.stringify(data))
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
        this._walletReady()
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

  renderSendTxQRScanner (cb) {
    // scan the qr code
    return (
      <View style={{
        flex: 1,
        flexDirection: 'row'
      }}>
        <Camera
          ref={(cam) => {
            this.barcodeRead = false
          }}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            alignItems: 'center'
          }}
          onBarCodeRead={this._sendTxQRScanned.bind(this, cb)}
          barCodeTypes={['qr']}
          aspect={Camera.constants.Aspect.fill}
        />
      </View>
    )
  }

  // private

  _walletReady () {
    this.ready = true
    // check for unsigned txns
    this._checkForActionableNotifications()
  }

  _checkForActionableNotifications () {
    this._debugLog('checking for actionable notifications')
    this.sdkdAjaxReq.getNotifications()
    .then(response => {
      if (response.length === 0) {
        return // no notifications
      }
      this._debugLog(JSON.stringify(response))
      // grab the first unapproved pairing request or unsigned txn
      let actionableThing = response.find(r => r.status === 'unsigned' || r.status === 'unapproved')
      if (actionableThing === undefined) {
        // no actionable notifications, return
        return
      }
      if (actionableThing.class_name === 'RemotePairingRequest') {
        // RemotePairingRequest format:
        // {
        //     "id": "96720638-5352-4d37-9ae1-59e62e798a1f",
        //     "user_id": "ae9b8fc8-02d6-4efe-b956-2c58d825340e",
        //     "request_ts": "1510884382094",
        //     "status": "unapproved",
        //     "request_ip": null,
        //     "created_at": "2017-11-17T02:06:24.584Z",
        //     "updated_at": "2017-11-17T02:06:24.584Z",
        //     "class_name": "RemotePairingRequest"
        // }

        this._debugLog('Asking user to approve pairing request ' + JSON.stringify(actionableThing))

        // ask the user if they wanna sign it
        Alert.alert(
          'Metamask Pairing Request',
          'Use this device to sign Metamask transactions?',
          [
            {
              text: 'Reject',
              onPress: () => {
                console.log('Cancel Pressed')
                // update on server that tx was rejected
                let body = {
                  id: actionableThing.id,
                  status: 'rejected'
                }
                this.sdkdAjaxReq.updatePairingRequest(body)
              },
              style: 'cancel'
            },
            {
              text: 'Approve',
              onPress: () => {
                console.log('OK Pressed')
                // upload to server
                let body = {
                  id: actionableThing.id,
                  status: 'approved'
                }
                this.sdkdAjaxReq.updatePairingRequest(body)
              }
            }
          ]
        )
      } else if (actionableThing.class_name === 'EthereumTx') {
        let tx = actionableThing.tx_params
        // EthereumTx format:
        // {
        //     "id": "037de246-f657-4241-84b0-ce192d11b2eb",
        //     "tx_params": {
        //         "nonce": "0x",
        //         "gasPrice": "0xee6b2805",
        //         "gasLimit": "0x7b0c",
        //         "to": "0x687422eea2cb73b5d3e242ba5456b782919afc85",
        //         "value": "0x016345785d8a0000",
        //         "data": "0x",
        //         "v": "0x1c",
        //         "r": "0x",
        //         "s": "0x"
        //     },
        //     "user_id": "ae9b8fc8-02d6-4efe-b956-2c58d825340e",
        //     "status": "unsigned",
        //     "signed_tx": null,
        //     "created_at": "2017-11-15T23:56:28.740Z",
        //     "updated_at": "2017-11-15T23:56:28.740Z",
        //     "class_name": "EthereumTx"
        // },

        // convert to ETH
        let value = tx.value
        value = ethFuncs.hexToDecimal(value)
        value = etherUnits.toEther(value, 'wei')

        this._debugLog('Asking user to sign tx ' + JSON.stringify(tx))

        // ask the user if they wanna sign it
        Alert.alert(
          'New Spending Request',
          'Request to send ' + value + ' ETH to ' + tx.to,
          [
            {
              text: 'Reject',
              onPress: () => {
                console.log('Cancel Pressed')
                // update on server that tx was rejected
                let body = {
                  id: actionableThing.id,
                  status: 'rejected'
                }
                this.sdkdAjaxReq.updateTx(body)
              },
              style: 'cancel'
            },
            {
              text: 'Approve',
              onPress: () => {
                console.log('OK Pressed')
                var eTx = new ethUtil.Tx(tx)
                let { privKey } = privates.get(this)
                eTx.sign(privKey)
                let signedTx = '0x' + eTx.serialize().toString('hex')
                // upload to server
                let body = {
                  id: actionableThing.id,
                  signed_tx: signedTx,
                  status: 'signed'
                }
                this.sdkdAjaxReq.updateTx(body)
              }
            }
          ]
        )
      }
    })
  }

  _configureMEWNode () {
    this.curNode = nodes.nodeList.rop_mew

    // set up remote node for mew, this is borrowed from MEW
    for (var attrname in this.curNode.lib) ajaxReq[attrname] = this.curNode.lib[attrname]
    for (var attrname in this.curNode) {
      if (attrname != 'name' && attrname != 'tokenList' && attrname != 'lib') { ajaxReq[attrname] = this.curNode[attrname] }
    }
  }

  _sendTxQRScanned (cb, data) {
    this._debugLog('_sendTxQRScanned:')
    if (this.barcodeRead) {
      return
    }
    this._debugLog('Barcode read: ')
    this._debugLog(JSON.stringify(data))
    this.barcodeRead = true
    // try generating a txn
    let txData = {
      to: null,
      value: 0,
      data: '',
      gasLimit: globalFuncs.defaultTxGasLimit,
      unit: 'eth',
      from: this.getAddressString()
    }

    let payload = data.data
    // the below is borrowed and modified from myetherwallet https://github.com/kvhnuke/etherwallet/blob/d5a471310c5cdde0ebb23ebe5d14a80f9bd40029/app/scripts/directives/addressFieldDrtv.js#L34
    var _ens = new Ens()
    // is this just an eth address, an ENS address, or is it a URL?
    if (Validator.isValidAddress(payload)) {
      // it's just a straight address, show confirmation screen with values
      this._debugLog('_sendTxQRScanned - regular eth address')
      txData.to = payload
      this._showTxConfirmationScreen(cb, txData)
    } else if (payload.indexOf(':') === -1 && Validator.isValidENSAddress(payload)) {
      // it's an ENS address
      this._debugLog('_sendTxQRScanned - ens address')
      _ens.getAddress(payload, (data) => {
        this._debugLog('_sendTxQRScanned - ens getAddress response: ' + JSON.stringify(data))
        if (data.error) {
          // report error
          Alert.alert(data.error)
          cb(new Error(data.error))
        } else if (data.data === '0x0000000000000000000000000000000000000000' || data.data === '0x') {
          const err = 'Error, your ENS address is mapped to ' + data.data + ' which is invalid.'
          Alert.alert(err)
          cb(new Error(err))
        } else {
          txData.to = data.data
          this._showTxConfirmationScreen(cb, txData)
        }
      })
    } else {
      // let's see if it's a URL
      this._debugLog('_sendTxQRScanned - it might be a url')
      let url = new URLParser(payload, true)
      this._debugLog('parsed url: ' + JSON.stringify(url))
      if (url.protocol !== 'ethereum:') {
        const err = 'Error, the address you scanned is not an ethereum address'
        Alert.alert(err)
        cb(new Error(err))
        return
      }

      let address = url.pathname
      if (!Validator.isValidAddress(address)) {
        const err = 'Error, the address URL you scanned is not valid.'
        Alert.alert(err)
        cb(new Error(err))
        return
      }
      // yay it's a valid address, let's parse the rest of the url
      txData.to = address
      // parse balance
      let query = url.query
      let value = query.value
      if (value !== undefined) {
        txData.value = value
      }
      let gas = query.gas || query.gasLimit
      if (gas !== undefined) {
        txData.gasLimit = gas
      }
      this._showTxConfirmationScreen(cb, txData)
    }
  }

  _showTxConfirmationScreen (cb, txData) {
    this._debugLog('_showTxConfirmationScreen() - txData: ' + JSON.stringify(txData))
    cb()
  }

  _recoveryQRScanned (cb, data) {
    this._debugLog('_recoveryQRScanned data:')
    if (this.barcodeRead) {
      return
    }
    this._debugLog('Barcode read: ')
    this._debugLog(JSON.stringify(data))
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
    this.sdkdAjaxReq.getRecoveryPart(sendToServer)
    .then(response => {
      this._debugLog('got recovery part')
      let remotePart = response.part
      // combine remotePart and localPart
      let s = new SDKDSSSS()
      let shares = [localPart, remotePart]
      let combined = s.combineShares(shares)
      let privKey = Buffer.from(combined, 'hex')
      this._storePrivateVar('privKey', privKey)
      // hurray, we recovered their wallet
      this._debugLog('recovered, eth address is ' + this.getAddressString())
      this._saveWallet()
      this._authenticateUser()
      .then(() => {
        this._walletReady()
        cb()
      })
    })
  }

  _authenticateUser () {
    this._debugLog('_authenticateUser')
    let body = this._signEmailForAuth()
    body['push_token'] = this.pushToken
    body['push_type'] = this.pushType
    this._debugLog(JSON.stringify(body))
    return new Promise((resolve, reject) => {
      this.sdkdAjaxReq.authenticateUser(body)
      .then(response => {
        this._debugLog(JSON.stringify(response))
        if (response.error) {
          reject(response.error)
        }
        // save JWT
        global.sdkdConfig.currentUserKey = response.jwt
        this._debugLog(JSON.stringify(response))
        resolve(response.jwt)
      })
      .catch(err => { reject(err) })
    })
  }

  _newPrivateKey () {
    this._debugLog('_newPrivateKey')
    let privKey = ethUtil.crypto.randomBytes(32)
    this._storePrivateVar('privKey', privKey)
  }

  _saveWallet () {
    this._debugLog('_saveWallet')
    let { privKey } = privates.get(this)
    privKey = privKey.toString('hex')
    Keychain
    .setInternetCredentials(this._keychainKey(), this.email, privKey)
    .then(() => {
      this._debugLog('Credentials saved successfully!')
    })
  }

  _sendWalletRecoveryParts () {
    this._debugLog('_sendWalletRecoveryParts')
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
    this._debugLog('_emailKeyPart')
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
    let awsKey = await this.sdkdAjaxReq.getAwsKey()
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
    this._debugLog('_uploadKeyPart')
    let body = {
      address: this.getAddressString(),
      part: part
    }
    this.sdkdAjaxReq.uploadKeyPart(body)
    .then(response => {
      this._debugLog(JSON.stringify(response))
      if (response.error) {
        throw new Error(response.error)
      }
      this._debugLog('uploaded key part 1')
    })
    .catch(err => { throw new Error(err) })
  }

  _registerUser () {
    this._debugLog('_registerUser')
    // register the user
    return new Promise((resolve, reject) => {
      let body = {
        email: this.email,
        push_token: this.pushToken,
        push_type: this.pushType
      }
      this.sdkdAjaxReq.registerUser(body)
      .then(response => {
        this._debugLog(JSON.stringify(response))
        if (response.error) {
          reject(response.error)
        }
        // save JWT
        global.sdkdConfig.currentUserKey = response.jwt
        this._debugLog('user registration complete')
        resolve(response.jwt)
      })
      .catch(err => { reject(err) })
    })
  }

  _debugLog (toLog) {
    if (this.debug === true) {
      console.log('[SDKDWallet]: ' + toLog)
    }
  }

  _signEmailForAuth () {
    this._debugLog('_signEmailForAuth')
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
    this._debugLog('_storePrivateVar')
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

  _configurePushNotifications () {
    this._debugLog('configuring push notifications')
    PushNotification.configure({

      // (optional) Called when Token is generated (iOS and Android)
      onRegister: (token) => {
        this._debugLog('TOKEN:' + JSON.stringify(token))
        this.pushToken = token.token
        this.pushType = token.os
        // poll until we have a user key.  this is because registration usually starts before this point, but has not returned from the server yet.  so we need to wait until the server returns a user key.
        // polls every 5 seconds
        let poller = setInterval(() => {
          this._debugLog('push notification registration polling, user key: ' + global.sdkdConfig.currentUserKey)
          if (global.sdkdConfig.currentUserKey === undefined) {
            return
          }
          clearInterval(poller) // user key is set, stop polling
          this._debugLog('sending new push token for user')
          // update on server
          let body = {
            push_token: this.pushToken,
            push_type: this.pushType
          }
          this.sdkdAjaxReq.updateUser(body)
        }, 5000)
      },

      // (required) Called when a remote or local notification is opened or received
      onNotification: (notification) => {
        this._debugLog('NOTIFICATION:' + JSON.stringify(notification))
        this._checkForActionableNotifications()
      },

      // ANDROID ONLY: GCM Sender ID (optional - not required for local notifications, but is need to receive remote push notifications)
      senderID: global.sdkdConfig.moduleConfig.wallet.gcmSenderId,

      // IOS ONLY (optional): default: all - Permissions to register.
      permissions: {
        alert: true,
        badge: true,
        sound: true
      },

      // Should the initial notification be popped automatically
      // default: true
      popInitialNotification: true,

      /**
        * (optional) default: true
        * - Specified if permissions (ios) and token (android and ios) will requested or not,
        * - if not, you must call PushNotificationsHandler.requestPermissions() later
        */
      requestPermissions: true
    })
  }
}

class SDKDAjaxReq {
  constructor (config) {
    if (config !== undefined) {
      this.debug = config.debug
    }
  }

  getRecoveryPart (requestBody) {
    return fetch(global.sdkdConfig.sdkdHost + '/user_key_parts/recover', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
  }

  authenticateUser (requestBody) {
    return fetch(global.sdkdConfig.sdkdHost + '/sessions', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
  }

  getAwsKey () {
    return fetch(global.sdkdConfig.sdkdHost + '/modules/wallet_aws_token', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey,
        'X-SDKD-User-Key': global.sdkdConfig.currentUserKey
      }
    })
    .then(response => response.json())
  }

  uploadKeyPart (requestBody) {
    return fetch(global.sdkdConfig.sdkdHost + '/user_key_parts', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey,
        'X-SDKD-User-Key': global.sdkdConfig.currentUserKey
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
  }

  registerUser (requestBody) {
    return fetch(global.sdkdConfig.sdkdHost + '/users', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
  }

  updateUser (requestBody) {
    return fetch(global.sdkdConfig.sdkdHost + '/users/self', {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey,
        'X-SDKD-User-Key': global.sdkdConfig.currentUserKey
      },
      body: JSON.stringify(requestBody)
    })
  }

  updateTx (requestBody) {
    return fetch(global.sdkdConfig.sdkdHost + '/transactions/' + requestBody.id, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey,
        'X-SDKD-User-Key': global.sdkdConfig.currentUserKey
      },
      body: JSON.stringify(requestBody)
    })
  }

  updatePairingRequest (requestBody) {
    return fetch(global.sdkdConfig.sdkdHost + '/remote_pairing_requests/' + requestBody.id, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey,
        'X-SDKD-User-Key': global.sdkdConfig.currentUserKey
      },
      body: JSON.stringify(requestBody)
    })
  }

  getNotifications () {
    return fetch(global.sdkdConfig.sdkdHost + '/notifications', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-SDKD-API-Client-Key': global.sdkdConfig.apiKey,
        'X-SDKD-User-Key': global.sdkdConfig.currentUserKey
      }
    })
    .then(response => response.json())
  }

  _debugLog (toLog) {
    if (this.debug === true) {
      console.log('[SDKDWallet.SDKDAjaxReq]: ' + toLog)
    }
  }
}

class EthNodeAjaxReq {
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
        this._debugLog(JSON.stringify(data))
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
        this._debugLog(JSON.stringify(response))
        if (response.error) reject(response.error.message)
        else resolve(new BigNumber(response.result).toString())
      })
      .catch(err => reject(err))
    })
  }

  _debugLog (toLog) {
    if (this.debug === true) {
      console.log('[SDKDWallet.EthNodeAjaxReq]: ' + toLog)
    }
  }
}
