# Amazon Request Signer

This module can sign a request for AWS using their Signature V4 format.  

# Getting started with SDKD

To install SDKD Aws Signer, follow the instructions below.

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
npm install --save @sdkd/sdkd-aws-signer
```

# Usage

To use this module, simply instantiate the class with a config object:

```js
// define a config that includes your region, and the service you're using.  
// in this example we're using AWS SES to send an email so service is "email"
// assume we have access key id, secret token, and session token in "credentials" object
// note that session token is optional
let config = {
  region: 'us-east-1',
  service: 'email',
  accessKeyId: credentials.access_key_id,
  secretAccessKey: credentials.secret_access_key,
  sessionToken: credentials.session_token
}

// create the signer 
let signer = new SDKDAwsSigner(config)
```

## Signing
To sign a POST request with body:

```js
// take the post body and convert it into a query string per AWS SES docs
let postBodyObj = {
  'Action': 'SendRawEmail',
  'Source': 'recovery@sdkd.co',
  'Destinations.member.1': to,
  'RawMessage.Data': base64Body
}
let postBody = Object.keys(postBodyObj)
.map(k => k + '=' + encodeURIComponent(postBodyObj[k]))
.join('&')

// Sign the request
var request = {
  method: 'POST',
  url: 'https://email.us-east-1.amazonaws.com',
  body: postBody
}
var signed = signer.sign(request)

// the "signed" variable now contains all the headers you need including the AWS security signature header.  You could use the "fetch" command below to send an email using SES, for example.
fetch('https://email.us-east-1.amazonaws.com', {
  method: 'POST',
  headers: signed,
  body: postBody
})
.then(response => this._debugLog(response))
.catch(err => { throw new Error(err) })
```
