# SDKD Shamir's Secret Sharing Module

This module can split a secret into n-of-m parts.  Learn more here: https://en.wikipedia.org/wiki/Shamir%27s_Secret_Sharing

Check out the github repo for docs and more info on how to use this library: https://github.com/glitch003/react-native-distributed-dev-kit

You will need to obtain an API key which can be done by signing up [here](https://app.sdkd.co)

Note that this module depends on https://github.com/mvayngrib/react-native-crypto so you should follow those installation instructions as well.

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