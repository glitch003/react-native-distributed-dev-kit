import 'react-native'
import React from 'react'
import App from '../App'

import SDKDConfig from '@sdkd/sdkd'
import SDKDWallet from '@sdkd/sdkd-wallet'
import SDKDSSSS from '@sdkd/sdkd-ssss'
import SDKDAwsSes from '@sdkd/sdkd-aws-ses'
import SDKDAwsSigner from '@sdkd/sdkd-aws-signer'

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

it('tests sdkd-ssss splitting into parts', async () => {
  let secret = 'd94527908e99bcff99bf7106f16d2490cf60e692'
  let s = new SDKDSSSS()
  let shares = s.share(secret, 4, 2)
  expect(shares.length).toBe(4)

  // pull out 2 shares
  let shareSubset = [
    shares[0],
    shares[3]
  ]
  let combined = s.combineShares(shareSubset)
  expect(combined).toBe(secret)
})

it('tests sdkd-ssss combining parts', async () => {
  let secret = 'd94527908e99bcff99bf7106f16d2490cf60e692'
  let shares = [
    '802d28e0cc9ed1f0daf76aab23c0740d8a69b1d32018e',
    '803352ba6be5dd94728bc3d3a9489960ce710741bfc80'
  ]
  let s = new SDKDSSSS()
  let combined = s.combineShares(shares)
  expect(combined).toBe(secret)
})

it('tests sdkd-aws-ses email sending', async (done) => {
  let sender = new SDKDAwsSes({
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
      sessionToken: 'test'
    },
    debug: false
  })

  expect(sender).toBeTruthy()

  let to = 'test@example.com'
  let fromAddr = 'test@example.com'
  let subject = 'This is a test'

  // only plaintext body is supported right now
  let body = 'This is the body of a test'

  // attachments should be an array of base64 data urls
  let attachments = [
    'data:image/png;base64,fVkVvYassFAAAABQAAAAIAAAAbWltZXR5cG=='
  ]

  // ses response
  fetch.mockResponseOnce(JSON.stringify({'SendRawEmailResponse': {'ResponseMetadata': {'RequestId': '5fd79fb8-c400-11e7-8d61-4108accf2c0d'}, 'SendRawEmailResult': {'MessageId': '0100015f9853e070-21cc3415-a7af-44b2-b517-3f7ff1358d1d-000000'}}}))

  sender.sendMessage(to, fromAddr, subject, body, attachments)
  .then(response => {
    done()
  })
})

it('tests sdkd-aws-signer signature generation', async () => {
  let base64Body = 'Q29udGVudC1UeXBlOiBtdWx0aXBhcnQvbWl4ZWQ7Ym91bmRhcnk9V0tjTm5IWFgNCkZyb206IHRlc3RAZXhhbXBsZS5jb20NClN1YmplY3Q6IFRoaXMgaXMgYSB0ZXN0DQpUbzogdGVzdEBleGFtcGxlLmNvbQ0KDQotLVdLY05uSFhYDQpDb250ZW50LVR5cGU6IHRleHQvcGxhaW47Y2hhcnNldD11dGYtOA0KDQpUaGlzIGlzIHRoZSBib2R5IG9mIGEgdGVzdA0KLS1XS2NObkhYWA0KQ29udGVudC1UeXBlOiBpbWFnZS9wbmcNCkNvbnRlbnQtVHJhbnNmZXItRW5jb2Rpbmc6IGJhc2U2NA0KQ29udGVudC1EaXNwb3NpdGlvbjogYXR0YWNobWVudDtmaWxlbmFtZT0iYXR0YWNobWVudC5wbmciDQoNCmZWa1Z2WWFzc0ZBQUFBQlFBQUFBSUFBQUFiV2x0WlhSNWNHPT0NCi0tV0tjTm5IWFgtLQ%3D%3D'

  // config for signing request
  let signingConfig = {
    region: 'us-east-1',
    service: 'email',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    sessionToken: 'test'
  }

  let signer = new SDKDAwsSigner(signingConfig)
  expect(signer).toBeTruthy()

  let postBodyObj = {
    'Action': 'SendRawEmail',
    'Source': 'test@example.com',
    'Destinations.member.1': 'test@example.com',
    'RawMessage.Data': base64Body
  }
  let postBody = Object.keys(postBodyObj)
  .map(k => k + '=' + encodeURIComponent(postBodyObj[k]))
  .join('&')

  // sign the request
  var request = {
    method: 'POST',
    url: 'https://email.us-east-1.amazonaws.com',
    body: postBody
  }

  var signed = signer.sign(request)
  // example signed obj:
  // {Accept: 'application/json',
  //    Authorization: 'AWS4-HMAC-SHA256 Credential=test/20171107/us-east-1/email/aws4_request, SignedHeaders=accept;content-type;host;x-amz-date, Signature=821bd0f94e0215a858255c6576ff4ca6ddf639bd3accd15dc71ad4bcb5e31773',
  //    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
  //    'X-Amz-Date': '20171107T215011Z',
  //    'X-Amz-Security-Token': 'test' }
  expect(signed).toBeTruthy()
  expect(signed['Accept']).toBe('application/json')
  expect(signed['Authorization']).toBeTruthy()
  expect(signed['Authorization'].length).toBeGreaterThan(128) // usually around 190+ chars
  expect(signed['Content-Type']).toBe('application/x-www-form-urlencoded; charset=utf-8')
  expect(signed['X-Amz-Date']).toBeTruthy()
  expect(signed['X-Amz-Security-Token']).toBe('test')
})
