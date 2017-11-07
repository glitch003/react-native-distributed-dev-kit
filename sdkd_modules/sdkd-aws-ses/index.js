// to craft the email
import mimemessage from 'mimemessage'

import SDKDAwsSigner from '@sdkd/sdkd-aws-signer'

export default class SDKDAwsSes {
  constructor (config) {
    this.config = {}
    if (config !== undefined) {
      this.debug = config.debug
      this.config = config
    }
  }
  sendMessage (to, fromAddr, subject, body, attachments) {
    this._debugLog('[SDKDAwsSes]: sendMessage')
    // craft mime message
    let mimeBody = this._craftEmail(to, fromAddr, subject, body, attachments)
    let base64Body = Buffer.from(mimeBody).toString('base64')

    // config for signing request
    let signingConfig = {
      region: 'us-east-1',
      service: 'email',
      accessKeyId: this.config.credentials.accessKeyId,
      secretAccessKey: this.config.credentials.secretAccessKey,
      sessionToken: this.config.credentials.sessionToken
    }

    let signer = new SDKDAwsSigner(signingConfig)

    let postBodyObj = {
      'Action': 'SendRawEmail',
      'Source': fromAddr,
      'Destinations.member.1': to,
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
    this._debugLog('request: ')
    this._debugLog(request)
    var signed = signer.sign(request)
    this._debugLog('signed request: ')
    this._debugLog(signed)
    return new Promise((resolve, reject) => {
      fetch('https://email.us-east-1.amazonaws.com', {
        method: 'POST',
        headers: signed,
        body: postBody
      })
      .then(response => {
        this._debugLog(response)
        resolve(response)
      })
      .catch(err => { reject(err) })
    })
  }

  _craftEmail (to, fromAddr, subject, body, attachments) {
    var msg, plainEntity

    // Build the top-level multipart MIME message.
    msg = mimemessage.factory({
      contentType: 'multipart/mixed',
      body: []
    })
    msg.header('From', fromAddr)
    msg.header('Subject', subject)
    msg.header('To', to)

    // Build the plain text MIME entity.
    plainEntity = mimemessage.factory({
      body: body
    })
    msg.body.push(plainEntity)

    // create the attachment entities
    let attachmentEntities = attachments.map(atchUrl => {
      // pull out content type from data url
      let dataType = atchUrl.substring(5, atchUrl.indexOf(';'))
      let fileExt = dataType.substring(dataType.indexOf('/') + 1)
      this._debugLog('mime type: ' + dataType)
      this._debugLog('file ext: ' + fileExt)
      let ent = mimemessage.factory({
        contentType: dataType,
        contentTransferEncoding: 'base64',
        body: atchUrl.replace('data:' + dataType + ';base64,', '') // remove encoding designator
      })
      // Build the PNG MIME entity.
      ent.header('Content-Disposition', 'attachment;filename="attachment.' + fileExt + '"')
      return ent
    })

    // Add the attachment entities to the top-level MIME message.
    attachmentEntities.forEach(ent => msg.body.push(ent))

    return msg.toString()
  }

  _debugLog (toLog) {
    if (this.debug === true) {
      console.log(toLog)
    }
  }
}
