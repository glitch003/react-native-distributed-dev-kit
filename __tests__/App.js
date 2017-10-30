import 'react-native'
import React from 'react'
import App from '../App'

import SDKDConfig from '@sdkd/sdkd'
import SDKDWallet from '@sdkd/sdkd-wallet'

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer'

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
  let e = null
  let p = null
  return {
    setInternetCredentials: jest.fn((email, password) => {
      e = email
      p = password
      return Promise.resolve()
    }),
    getInternetCredentials: jest.fn((email) => {
      return new Promise((resolve, reject) => {
        if (e === null) {
          resolve(false)
        }
        resolve({username: e, password: p})
      })
    })
  }
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
  // mock create user response
  fetch.mockResponseOnce(JSON.stringify({ jwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYTZlZTY0NzMtNmExMi00OGY4LWEyYWUtMjRjMTg2NjM5OGI5IiwiY3JlYXRlZF9hdCI6MTUwOTM5OTMyMn0.2N6Y4oyaPGC2mpsjzz9rE5tG47tAmqI-jMrVd8o9WC4' }))

  // mock store user key parts response
  fetch.mockResponseOnce(JSON.stringify({ success: true }))

  SDKDConfig.init(SDKD_APIKEY)
  let w = new SDKDWallet({debug: false})
  expect(w).toBeTruthy()
  let phrase = await w.activate({email: 'glitch0@gmail.com', recoveryType: 'phrase'})
  expect(phrase).toBeTruthy()
  expect(phrase.length).toBeGreaterThan(10) // length should be 24 words and will always be more than 10 chars
  expect(phrase.split(' ').length).toBe(24) // 24 words separated by spaces
  let walletAddress = w.getAddressString()
  expect(walletAddress.length).toBe(42)

  // try activating again to make sure that everything works when the user opens the app a second time.  the private key should be in the keychain so the address string should match.

  // auth user response
  fetch.mockResponseOnce(JSON.stringify({ jwt: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYTZlZTY0NzMtNmExMi00OGY4LWEyYWUtMjRjMTg2NjM5OGI5IiwiY3JlYXRlZF9hdCI6MTUwOTM5OTMyMn0.2N6Y4oyaPGC2mpsjzz9rE5tG47tAmqI-jMrVd8o9WC4' }))

  w = new SDKDWallet({debug: false})
  let undefinedPhrase = await w.activate({email: 'glitch0@gmail.com', recoveryType: 'phrase'})
  expect(undefinedPhrase).toBeUndefined()
  let walletAddressAfter = w.getAddressString()
  expect(walletAddressAfter).toBe(walletAddress)

  // test recovery from original phrase
  w = new SDKDWallet({debug: false})
  w.activateFromRecoveryPhrase('glitch0@gmail.com', phrase)
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
