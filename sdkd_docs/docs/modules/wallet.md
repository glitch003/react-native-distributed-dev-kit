# Ethereum Wallet - React Native

The wallet module lets you provision a wallet for a user, and all you need to provide is an email address.  The private key is stored securely on the device in the user's encrypted keychain.  An account entry is created on our servers for the user.  The public address associated with the user is uploaded to our servers.  

# Getting started with SDKD

To install SDKD wallet, follow the instructions below.

You will need to obtain an API key which can be done by signing up [here](http://app.sdkd.co)

Note that in addition to installing the sdkd-wallet npm module, you'll also need to install a few dependencies and rn-nodeify to shim some nodejs packages. This is because react-native doesn't currently have a [resolve.alias a la webpack](https://productpains.com/post/react-native/packager-support-resolvealias-ala-webpack).


```sh
npm i --save react-native-crypto
# install peer deps
npm i --save react-native-randombytes react-native-keychain
react-native link
# install latest rn-nodeify
npm i --save-dev mvayngrib/rn-nodeify
# install node core shims and recursively hack package.json files
# in ./node_modules to add/update the "browser"/"react-native" field with relevant mappings
./node_modules/.bin/rn-nodeify --hack --install
```

`rn-nodeify` will create a `shim.js` in the project root directory

```js
// index.ios.js or index.android.js
// make sure you use `import` and not require!  
import './shim.js'
// ...the rest of your code
```

# Installation

```sh
npm install --save @sdkd/sdkd-wallet
```

# Usage

To use the wallet, you must import the sdkd config module, and set your sdkd.co API key.  You can get an sdkd.co API key by contacting us using the contact form at sdkd.co

The code below will set your API key, and create a new wallet for a user with email test@example.com.

If no recovery type is chosen, the user will receive an email with a recovery key they can use if they lose access to their phone.


```js
import SDKDConfig from '@sdkd/sdkd'
import SDKDWallet from '@sdkd/sdkd-wallet'
```

```js
const SDKD_APIKEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcGlfY2xpZW50X2lkIjoiNGVkNTNiYTAtNTRjYy00M2QwLTk4MDgtZGZiMTY2ZDhhMmI4IiwiY3JlYXRlZF9hdCI6MTUwNzIzNjQ4OH0.z4_h_4iTCYyv0OMCqe6RE0XEvM_DIagTR3lfRbQt74w'

SDKDConfig.init(SDKD_APIKEY)
let w = new SDKDWallet()
w.activate({email: 'test@example.com'})
.then(() => {
  // The wallet is now ready to go.  You can store it in your state if you want to render stuff like the user's wallet address or a QR code for their address.
  this.setState({wallet: w})
});

```

# Basic Functions

This section documents the public functions you can use with the wallet module.

## Constructor

**Example Usage**

```js
let w = new SDKDWallet()
```

The constructor takes 1 optional argument, a config object with the following properties:

```plain
{
  debug: (Optional) <boolean> - defines whether or not debug statements will be printed to the console
}
```

## Activate
Creates or loads the user's wallet account, using their email address as the primary key.  
The activate function takes 1 required argument, a config object with the following properties:

```plain
{
  email: (Required) <string> - the users email address,
  recoveryType: (Optional) <string> - one of either 'email' (the default) for 2 factor email recovery or 'phrase' for 24 word passphrase
}
```

- If the activate function has never been called on this device for a given email, a new wallet will be created for that user.  The private key will be saved in their local keychain.

- If the activate function has already been called on this device for a given email, the private key will be loaded from the user's keychain. 

### Recovery type options

- email: The user's private key will be split into two parts.  The first part will be emailed to the user.  The second part is uploaded to our servers.  If the user loses access to their phone, they can recover the private key by combing these two parts.
- phrase: The user's private key will be returned by the activate function promise in the form of a 24 word recovery phrase that follows the widely used bip39 standard.  For security, first account activation is the only time you can ever retrieve the recovery phrase, since this gives you direct access to the user's private key.

**Example Usage with {recoveryType: 'email'}**

Note that there is no need to actually pass {recoveryType: 'email'} because it's the default.

```js
w.activate({email: 'test@example.com'})
.then(() => {
  // wallet is now provisioned and ready to go.
  // you may want to store it in your state so you can do things like render a QR code for the user's ethereum address
  this.setState({wallet: w})
});
```

**Example Usage with {recoveryType: 'phrase'}**

```js
w.activate({email: 'test@example.com', recoveryType: 'phrase'})
.then((phrase) => {
  // wallet is now provisioned and ready to go
  // show the user the contents of the 'phrase' variable so that they can write it down for recovery.  This is the only opportunity you will ever have to get the phrase.
  if (phrase !== undefined) { // needed because phrase will only be defined on first account activation
    Alert.alert('Write this down', 'Keep this somewhere safe: ' + phrase)
  }
});
```

## Get ethereum address string

Returns the ethereum address as a hex string for the wallet.

**Example Usage**

```js
let address = w.getAddressString()
// do something with address
console.log('Your ethereum address is ' + address)
```

## Get balance

Returns the a promise that resolves with the user's ETH balance in wei.

**Example Usage**

```js
let balance = await w.getBalance()
// do something with balance
console.log('Your ethereum balance in wei is ' + balance)
// you may want to store the user's balance in the state if you wish to display it
this.setState({balance})
```

## Render address QR code

Renders a 200x200px QR code encoded with the user's ethereum address string.  If you display this on the screen, another user can scan this user's QR code to send them ether or tokens.

**Example Usage to show user's balance and a QR code for their address**

```jsx
render () {
  return (
    <View style={styles.container}>
      <Text>
        Your balance is {this.state.balance} Wei
      </Text>
      {this.state.wallet ? this.state.wallet.renderAddressQRCode() : null}
    </View>
  )
}
```

## Send transaction

Sends an ethereum transaction.  This function accepts two arguments: 

- to: the ethereum address to send to
- value: the amount of wei to send

This function returns a promise that resolves to the transaction hash of the transaction.  

**Example Usage**

```js
// this will send 100 wei to the example address specified in the first argument.
let txHash = await w.sendTx('0x164f64dac95870b7b1261e233221778b1186102a', 100);
console.log('Your transaction is now live at https://ropsten.etherscan.io/tx/' + txHash)
```

## Activate from recovery phrase

If you originally chose recoveryType: 'phrase' when activating the user's wallet, and they lose access to their phone, you can use this function to recover a user's private key.

This function takes 2 arguments:

- email: the user's email
- phrase: the recovery phrase

**Example Usage**

```js
let phrase = 'lyrics sport manage dinosaur enemy dish mercy science apple shiver planet lemon lend grain copy equal believe perfect gesture slogan room cycle order abuse'
w.activateFromRecoveryPhrase('text@example.com', phrase)
.then(() => {
  // wallet is now provisioned and ready to go.
  // you may want to store it in your state so you can do things like render a QR code for the user's ethereum address
  this.setState({wallet: w})
})
```

## Render recovery QR scanner

If you originally chose recoveryType: 'email' (or used the default) when activating the user's wallet, and they lose access to their phone, you can use this function to recover a user's private key.

Return this function in your render() and it will render a camera for the user.  The user should point the camera at their recovery QR code.  The app will detect the QR code, and recover the user's wallet from it.  

This function takes 1 argument which is a callback function that is called once the wallet has been successfully restored.

**Example Usage**

```js
  render () {
    if (this.state.recovering) { // only show the camera QR scanner view if we're recovering
      return this.state.wallet.renderRecoveryQRScanner(() => {
        console.log('wallet has been recovered')
        console.log('address is ' + this.state.wallet.getAddressString())
        this.setState({recovering: false})
        this.state.wallet.getBalance()
        .then(balance => this.setState({balance}))
      })
    }
  }
```


# Advanced functions

Most users will not need to use these functions, but they are included for your convenience anyway, just in case.  For example, one of these functions give you access to the user's raw public key which you could use for your own cryptographic purposes.

## Get ethereum address

Returns the raw ethereum address for the wallet.  This is an array of bytes.

**Example Usage**

```js
let address = w.getAddress()
// do something with address
```

## Get checksum address string

Returns the checksum address for the wallet as a hex string.

**Example Usage**

```js
let chsum = w.getChecksumAddressString()
// do something with chksum
```

## Get public key

Returns the raw public key for the wallet.  This is an array of bytes.

**Example Usage**

```js
let pubKey = w.getPublicKey()
// do something with pubKey
```

## Get public key string

Returns the public key as a hex string for the wallet.

**Example Usage**

```js
let pubKey = w.getPublicKeyString()
// do something with pubKey
```



