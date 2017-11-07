import 'react-native'
import React from 'react'
import App from '../App'

import SDKDConfig from '@sdkd/sdkd'
import SDKDWallet from '@sdkd/sdkd-wallet'

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer'

import * as Keychain from 'react-native-keychain'

const SDKD_APIKEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcGlfY2xpZW50X2lkIjoiNGVkNTNiYTAtNTRjYy00M2QwLTk4MDgtZGZiMTY2ZDhhMmI4IiwiY3JlYXRlZF9hdCI6MTUwNzIzNjQ4OH0.z4_h_4iTCYyv0OMCqe6RE0XEvM_DIagTR3lfRbQt74w' // local

jest.mock('WebView', () => 'WebView')

jest.mock('NativeModules', () => {
  return {
    RNRandomBytes: {
      seed: undefined,
      randomBytes: jest.fn()
    }
  }
})

jest.mock('react-native-keychain', () => {
  let domains = {}
  return {
    setInternetCredentials: jest.fn((domain, email, password) => {
      domains[domain] = {
        email: email,
        password: password
      }
      return Promise.resolve()
    }),
    getInternetCredentials: jest.fn((domain) => {
      return new Promise((resolve, reject) => {
        if (domains[domain] === null || domains[domain] === undefined || domains[domain].email == null) {
          resolve(false)
        }
        resolve({username: domains[domain].email, password: domains[domain].password})
      })
    })
  }
})

jest.mock('react-native-camera', () => {
  return {}
})

it('renders correctly', () => {
  const tree = renderer.create(
    <App />
  ).toJSON()
  expect(tree).toMatchSnapshot()
})

it('configures sdkd correctly', () => {
  SDKDConfig.init(SDKD_APIKEY)
  expect(global.sdkdConfig.apiKey).toBe(SDKD_APIKEY)
  expect(global.sdkdConfig.sdkdHost).toBeTruthy()
})

it('tests sdkd-wallet with recovery phrase', async () => {
  // clean keychain
  Keychain.setInternetCredentials('sdkd_private_key_for_test@example.com', null, null)

  // mock create user response
  fetch.mockResponseOnce(JSON.stringify({ jwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYTZlZTY0NzMtNmExMi00OGY4LWEyYWUtMjRjMTg2NjM5OGI5IiwiY3JlYXRlZF9hdCI6MTUwOTM5OTMyMn0.2N6Y4oyaPGC2mpsjzz9rE5tG47tAmqI-jMrVd8o9WC4' }))

  // mock store user key parts response
  fetch.mockResponseOnce(JSON.stringify({ success: true }))

  SDKDConfig.init(SDKD_APIKEY)
  let w = new SDKDWallet({debug: false})
  expect(w).toBeTruthy()
  let phrase = await w.activate({email: 'test@example.com', recoveryType: 'phrase'})
  expect(phrase).toBeTruthy()
  expect(phrase.length).toBeGreaterThan(10) // length should be 24 words and will always be more than 10 chars
  expect(phrase.split(' ').length).toBe(24) // 24 words separated by spaces
  let walletAddress = w.getAddressString()
  expect(walletAddress.length).toBe(42)

  // try activating again to make sure that everything works when the user opens the app a second time.  the private key should be in the keychain so the address string should match.

  // auth user response
  fetch.mockResponseOnce(JSON.stringify({ jwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYTZlZTY0NzMtNmExMi00OGY4LWEyYWUtMjRjMTg2NjM5OGI5IiwiY3JlYXRlZF9hdCI6MTUwOTM5OTMyMn0.2N6Y4oyaPGC2mpsjzz9rE5tG47tAmqI-jMrVd8o9WC4' }))

  w = new SDKDWallet({debug: false})
  let undefinedPhrase = await w.activate({email: 'test@example.com', recoveryType: 'phrase'})
  expect(undefinedPhrase).toBeUndefined()
  let walletAddressAfter = w.getAddressString()
  expect(walletAddressAfter).toBe(walletAddress)

  // test recovery from original phrase
  w = new SDKDWallet({debug: false})
  w.activateFromRecoveryPhrase('test@example.com', phrase)
  walletAddressAfter = w.getAddressString()
  expect(walletAddressAfter).toBe(walletAddress)

  // test getting balance
  // mock get balance response
  fetch.mockResponseOnce(JSON.stringify({ result: 0 }))

  let balance = await w.getBalance()
  expect(balance).toBe('0')

  // test sending tx
  // mock getTransactionData response
  fetch.mockResponseOnce(JSON.stringify([
    { result: 0 }, // balance
    { result: '0xdeadbeef' }, // gasprice
    { result: '0xdeadbeef' } // nonce
  ]))

  // mock sendRawTx response
  fetch.mockResponseOnce(JSON.stringify({ data: 'meow' }))

  // send to random eth address
  let txHash = await w.sendTx('0x9899AF5Aa1EfA90921d686212c87e70F4fbea035', 100)
  expect(txHash).toBe('meow')
})

it('tests sdkd-wallet with default options', async () => {
  // clean keychain
  Keychain.setInternetCredentials('sdkd_private_key_for_test@example.com', null, null)

  // mock create user response
  fetch.mockResponseOnce(JSON.stringify({ jwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYTZlZTY0NzMtNmExMi00OGY4LWEyYWUtMjRjMTg2NjM5OGI5IiwiY3JlYXRlZF9hdCI6MTUwOTM5OTMyMn0.2N6Y4oyaPGC2mpsjzz9rE5tG47tAmqI-jMrVd8o9WC4' }))

  // mock store user key parts response
  fetch.mockResponseOnce(JSON.stringify({ success: true }))

  SDKDConfig.init(SDKD_APIKEY)
  let w = new SDKDWallet({debug: false})
  expect(w).toBeTruthy()
  let phrase = await w.activate({email: 'test@example.com'})
  expect(phrase).toBeUndefined()
  let walletAddress = w.getAddressString()

  // try activating again to make sure that everything works when the user opens the app a second time.  the private key should be in the keychain so the address string should match.

  // auth user response
  fetch.mockResponseOnce(JSON.stringify({ jwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYTZlZTY0NzMtNmExMi00OGY4LWEyYWUtMjRjMTg2NjM5OGI5IiwiY3JlYXRlZF9hdCI6MTUwOTM5OTMyMn0.2N6Y4oyaPGC2mpsjzz9rE5tG47tAmqI-jMrVd8o9WC4' }))

  w = new SDKDWallet({debug: false})
  let undefinedPhrase = await w.activate({email: 'test@example.com'})
  expect(undefinedPhrase).toBeUndefined()
  let walletAddressAfter = w.getAddressString()
  expect(walletAddressAfter).toBe(walletAddress)

  // test getting balance
  // mock get balance response
  fetch.mockResponseOnce(JSON.stringify({ result: 0 }))

  let balance = await w.getBalance()
  expect(balance).toBe('0')

  // test sending tx
  // mock getTransactionData response
  fetch.mockResponseOnce(JSON.stringify([
    { result: 0 }, // balance
    { result: '0xdeadbeef' }, // gasprice
    { result: '0xdeadbeef' } // nonce
  ]))

  // mock sendRawTx response
  fetch.mockResponseOnce(JSON.stringify({ data: 'meow' }))

  // send to random eth address
  let txHash = await w.sendTx('0x9899AF5Aa1EfA90921d686212c87e70F4fbea035', 100)
  expect(txHash).toBe('meow')
})

it('tests sdkd-wallet email recovery via QR code', async (done) => {
  // clean keychain
  Keychain.setInternetCredentials('sdkd_private_key_for_test@example.com', null, null)

  let walletAddress = '0x695e0b79c0c81aa6a1375b98b38413b83be103d3'

  SDKDConfig.init(SDKD_APIKEY)
  let w = new SDKDWallet({debug: false})
  expect(w).toBeTruthy()

  // test qr code recovery
  let qrJson = {
    data: JSON.stringify({'email': 'cvcassano@gmail.com', 'api_client_id': '907a7bd9-5bd1-423a-94b0-b68e9d673aca', 'part': '8013dd54f1c0313d5342256fb2e392f8b4af174e1fb31d83f13373899d29d6f81b766', 'signedEmail': {'r': '0dfd6a7aa8155e9accac1f04478415dff21f8168ab7e473e40d3e8390411b758', 's': '6f0ad93f7379b9fccb2f3be1a71187f2b97c69cf4051dc53b5c59348aef20a5f', 'v': '1b'}})
  }

  // mock getting part response
  fetch.mockResponseOnce(JSON.stringify({ part: '802793a48c4e13c5992de3e1aabbaac525959229d796161ccfe699e1b839aa4d44cb8' }))

  // auth user response
  fetch.mockResponseOnce(JSON.stringify({ jwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYTZlZTY0NzMtNmExMi00OGY4LWEyYWUtMjRjMTg2NjM5OGI5IiwiY3JlYXRlZF9hdCI6MTUwOTM5OTMyMn0.2N6Y4oyaPGC2mpsjzz9rE5tG47tAmqI-jMrVd8o9WC4' }))

  w._recoveryQRScanned(() => {
    // success callback
    expect(w.ready).toBe(true)
    let walletAddressAfter = w.getAddressString()
    expect(walletAddressAfter).toBe(walletAddress)
    done()
  }, qrJson)
})
