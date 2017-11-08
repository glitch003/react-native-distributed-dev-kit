# SDKD Aws Signer

This module is used to sign requests destined for AWS using their Signature V4 format.

Check out the github repo for docs and more info on how to use this library: https://github.com/glitch003/react-native-distributed-dev-kit

You will need to obtain an API key which can be done by signing up [here](https://app.sdkd.co)

Note that this module depends on https://github.com/mvayngrib/react-native-crypto so you should follow those installation instructions as well.

To sign a request:

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

// create the signer 
let signer = new SDKDAwsSigner(config)

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