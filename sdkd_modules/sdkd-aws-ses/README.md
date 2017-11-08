# SDKD Aws Ses

This module is used to send emails using AWS SES.  

Check out the github repo for docs and more info on how to use this library: https://github.com/glitch003/react-native-distributed-dev-kit

You will need to obtain an API key which can be done by signing up [here](https://app.sdkd.co)

Note that this module depends on https://github.com/mvayngrib/react-native-crypto so you should follow those installation instructions as well.

To send an email:

```js
// create the sender and pass in a config with credentials and optional debug flag
let sender = new SDKDAwsSes({
  credentials: {
    accessKeyId: 'a_key_id',
    secretAccessKey: 'a_secret_key',
    sessionToken: 'a_session_token' // this is optional
  },
  debug: false
})

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