# Amazon Simple Email Service

This module can send an email from a device using Amazon SES.  Learn more about Amazon SES here: https://aws.amazon.com/ses/

# Getting started with SDKD

To install SDKD Aws Ses, follow the instructions below.

You will need to obtain an API key which can be done by signing up [here](https://app.sdkd.co)

Note that in addition to installing the sdkd-aws-ses npm module, you'll also need to install a few dependencies and rn-nodeify to shim some nodejs packages. This is because react-native doesn't currently have a [resolve.alias a la webpack](https://productpains.com/post/react-native/packager-support-resolvealias-ala-webpack).


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
npm install --save @sdkd/sdkd-aws-ses
```

# Usage

To use this module, instantiate the class with a config that contains a credentials object containing your aws credentials and an optional debug flag

```js
let sender = new SDKDAwsSes({
  credentials: {
    accessKeyId: 'a_key_id',
    secretAccessKey: 'a_secret_key',
    sessionToken: 'a_session_token' // this is optional
  },
  debug: false
})
```

## Sending
To send an email:

```js

let to = 'test@example.com'
let fromAddr = 'test@example.com'
let subject = 'This is a test'

// only plaintext body is supported right now
let body = 'This is the body of a test'

// attachments should be an array of base64 data urls
let attachments = [
  'data:image/png;base64,fVkVvYassFAAAABQAAAAIAAAAbWltZXR5cG=='
]

// send the message
sender.sendMessage(to, fromAddr, subject, body, attachments)
.then(response => {
  console.log('email sent with response: ' + response)
})
```




# Basic Functions

This section documents the public functions you can use with the AWS Ses module.

## Constructor

**Example Usage**

```js
let sender = new SDKDAwsSes({
  credentials: {
    accessKeyId: 'a_key_id',
    secretAccessKey: 'a_secret_key',
    sessionToken: 'a_session_token' // this is optional
  },
  debug: false
})
```

The constructor takes 1 argument which is a config object.  It should contain a "credentials" object that contains aws keys and an optional session token.

## Send Message
Send an email

```plain
to: (Required) <string> - the email address to send to
fromAddr: (Required) <string> - the email to send from.  Note that this must belong to a domain you've verified in SES.
subject: (Required) <string> - the email subject
body: (Required) <string> - the email body, only plaintext is supported right now,.
attachments: (Required) <array> - an array of base64 data urls to be attached to the email.  If you wish to send no attachments, please pass an empty array.
```

**Example Usage**

```js
let to = 'test@example.com'
let fromAddr = 'test@example.com'
let subject = 'This is a test'

// only plaintext body is supported right now
let body = 'This is the body of a test'

// attachments should be an array of base64 data urls
let attachments = [
  'data:image/png;base64,fVkVvYassFAAAABQAAAAIAAAAbWltZXR5cG=='
]

// send the message
sender.sendMessage(to, fromAddr, subject, body, attachments)
.then(response => {
  this._debugLog('email sent with response: ' + response)
})
```


