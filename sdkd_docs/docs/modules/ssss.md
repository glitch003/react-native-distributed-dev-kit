# Shamir's Secret Sharing Scheme

This module can split a secret into n-of-m parts.  Learn more here: https://en.wikipedia.org/wiki/Shamir%27s_Secret_Sharing 

# Getting started with SDKD

To install SDKD SSSS, follow the instructions below.

You will need to obtain an API key which can be done by signing up [here](http://app.sdkd.co)

Note that in addition to installing the sdkd-ssss npm module, you'll also need to install a few dependencies and rn-nodeify to shim some nodejs packages. This is because react-native doesn't currently have a [resolve.alias a la webpack](https://productpains.com/post/react-native/packager-support-resolvealias-ala-webpack).


```sh
npm i --save react-native-crypto
# install peer deps
npm i --save react-native-randombytes
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
npm install --save @sdkd/sdkd-ssss
```

# Usage

To use this module, simply instantiate the class with no parameters:

```js
let s = new SDKDSSSS()
```

## Splitting
To split into 4 parts with 2 required to recover the secret:

```js
let secret = 'd94527908e99bcff99bf7106f16d2490cf60e692'
let s = new SDKDSSSS()
let shares = s.share(secret, 4, 2)
console.log(shares)
// console output: 
[ '801e67cef502048d33b350e37d98827b9651ba6491b9c',
  '802d28e0cc9ed1f0daf76aab23c0740d8a69b1d32018e',
  '803352ba6be5dd94728bc3d3a9489960ce710741bfc80',
  '804ba77d7e66ab1ac9af0ffa5eb048e1a3d8676c435aa' ]
```

## Combining
To combine:

```js
let shares = [
  '802d28e0cc9ed1f0daf76aab23c0740d8a69b1d32018e',
  '803352ba6be5dd94728bc3d3a9489960ce710741bfc80'
]
let s = new SDKDSSSS()
let combined = s.combineShares(shares)
console.log(combined)
// console output:
d94527908e99bcff99bf7106f16d2490cf60e692
```

# Basic Functions

This section documents the public functions you can use with the SSSS module.

## Constructor

**Example Usage**

```js
let s = new SDKDSSSS()
```

The constructor takes 1 optional argument which is the number of bits to use when processing this secret.  The default is 8.

## Share (split a secret)
Splits a secret into n-of-m keys.  Takes 3 arguments

```plain
secret: (Required) <hex string> - the secret to split
totalShares: (Required) <integer> - the total number of shares to generate
thresholdShares: (Required) <integer> - the number of shares required to recreate the secret
```

**Example Usage**

```js
let secret = 'd94527908e99bcff99bf7106f16d2490cf60e692'
let s = new SDKDSSSS()
let shares = s.share(secret, 4, 2)
console.log(shares)
// console output: 
[ '801e67cef502048d33b350e37d98827b9651ba6491b9c',
  '802d28e0cc9ed1f0daf76aab23c0740d8a69b1d32018e',
  '803352ba6be5dd94728bc3d3a9489960ce710741bfc80',
  '804ba77d7e66ab1ac9af0ffa5eb048e1a3d8676c435aa' ]
```


## Combine Shares
Combines shares to recreate a secret.  Takes 1 argument, which is an array of shares.

**Example Usage**

```js
let shares = [
  '802d28e0cc9ed1f0daf76aab23c0740d8a69b1d32018e',
  '803352ba6be5dd94728bc3d3a9489960ce710741bfc80'
]
let s = new SDKDSSSS()
let combined = s.combineShares(shares)
console.log(combined)
// console output:
d94527908e99bcff99bf7106f16d2490cf60e692
```
