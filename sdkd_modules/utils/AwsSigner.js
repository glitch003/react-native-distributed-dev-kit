// modified this to work with react native from here https://github.com/danieljoos/aws-sign-web

import crypto from 'crypto'
var URLParser = require('url-parse')

const defaultConfig = {
  region: 'eu-west-1',
  service: 'execute-api',
  defaultContentType: 'application/json',
  defaultAcceptType: 'application/json'
}

export default class AwsSigner {
    /**
     * Create a new signer object with the given configuration.
     * Configuration must specify the AWS credentials used for the signing operation.
     * It must contain the following properties:
     * `accessKeyId`: The AWS IAM access key ID.
     * `secretAccessKey`: The AWS IAM secret key.
     * `sessionToken`: Optional session token, required for temporary credentials.
     * @param {object} config The configuration object.
     * @constructor
     */
  constructor (config) {
    this.config = this.extend({}, defaultConfig, config)
    this.payloadSerializer = this.JsonPayloadSerializer()
    // this.config.payloadSerializer ||
            // this.config.payloadSerializerFactory()
    this.uriParser = this.SimpleUriParser()
    // this.config.uriParserFactory()
    this.hasher = this.CryptoJSHasher()
    // this.config.hasherFactory()
    this.assertRequired(this.config.accessKeyId, 'AwsSigner requires AWS AccessKeyID')
    this.assertRequired(this.config.secretAccessKey, 'AwsSigner requires AWS SecretAccessKey')
  }

    /**
     * Create signature headers for the given request.
     * Request must be in the format, known from the `$http` service of Angular:
     * ```
     * request = {
     *      headers: { ... },
     *      method: 'GET',
     *      url: 'http://...',
     *      params: { ... },
     *      data: ...           // alternative: body
     * };
     * ```
     * The resulting object contains the signature headers. For example, it can be merged into an
     * existing `$http` config when dealing with Angular JS.
     * @param {object} request The request to create the signature for. Will not be modified!
     * @param {Date=} signDate Optional signature date to use. Current date-time is used if not specified.
     * @returns Signed request headers.
     */
  sign (request, signDate) {
    var workingSet = {
      request: this.extend({}, request),
      signDate: signDate || new Date(),
      uri: this.uriParser(request.url)
    }
    this.prepare(workingSet)
    this.buildCanonicalRequest(workingSet)    // Step1: build the canonical request
    this.buildStringToSign(workingSet)        // Step2: build the string to sign
    this.calculateSignature(workingSet)       // Step3: calculate the signature hash
    this.buildSignatureHeader(workingSet)     // Step4: build the authorization header
    return {
      'Accept': workingSet.request.headers['accept'],
      'Authorization': workingSet.authorization,
      'Content-Type': workingSet.request.headers['content-type'],
      'x-amz-date': workingSet.request.headers['x-amz-date'],
      'x-amz-security-token': this.config.sessionToken || undefined
    }
  }

    // Some preparations
  prepare (ws) {
    var headers = {
      'host': ws.uri.host,
      'content-type': this.config.defaultContentType,
      'accept': this.config.defaultAcceptType,
      'x-amz-date': this.amzDate(ws.signDate)
    }
        // Payload or not?
    ws.request.method = ws.request.method.toUpperCase()
    if (ws.request.body) {
      ws.payload = ws.request.body
    } else if (ws.request.data && this.payloadSerializer) {
      ws.payload = this.payloadSerializer(ws.request.data)
    } else {
      delete headers['content-type']
    }
        // Headers
    ws.request.headers = this.extend(
            headers,
            Object.keys(ws.request.headers || {}).reduce(function (normalized, key) {
              normalized[key.toLowerCase()] = ws.request.headers[key]
              return normalized
            }, {})
        )
    ws.sortedHeaderKeys = Object.keys(ws.request.headers).sort()
        // Remove content-type parameters as some browser might change them on send
    if (ws.request.headers['content-type']) {
      ws.request.headers['content-type'] = ws.request.headers['content-type'].split(';')[0]
    }
        // Merge params to query params
    if (typeof (ws.request.params) === 'object') {
      this.extend(ws.uri.queryParams, ws.request.params)
    }
  }

    // Convert the request to a canonical format.
  buildCanonicalRequest (ws) {
    ws.signedHeaders = ws.sortedHeaderKeys.map(function (key) {
      return key.toLowerCase()
    }).join(';')
    ws.canonicalRequest = String(ws.request.method).toUpperCase() + '\n' +
                // Canonical URI:
            ws.uri.path.split('/').map(function (seg) {
              return encodeURIComponent(seg)
            }).join('/') + '\n' +
                // Canonical Query String:
            Object.keys(ws.uri.queryParams).sort().map(function (key) {
              return encodeURIComponent(key) + '=' +
                    encodeURIComponent(ws.uri.queryParams[key])
            }).join('&') + '\n' +
                // Canonical Headers:
            ws.sortedHeaderKeys.map(function (key) {
              return key.toLocaleLowerCase() + ':' + ws.request.headers[key]
            }).join('\n') + '\n\n' +
                // Signed Headers:
            ws.signedHeaders + '\n' +
                // Hashed Payload
            this.hasher.hash((ws.payload) ? ws.payload : '')
  }

    // Construct the string that will be signed.
  buildStringToSign (ws) {
    ws.credentialScope = [this.amzDate(ws.signDate, true), this.config.region, this.config.service,
      'aws4_request'].join('/')
    ws.stringToSign = 'AWS4-HMAC-SHA256' + '\n' +
            this.amzDate(ws.signDate) + '\n' +
            ws.credentialScope + '\n' +
            this.hasher.hash(ws.canonicalRequest)
  }

    // Calculate the signature
  calculateSignature (ws) {
    var hmac = this.hasher.hmac
    var signKey = hmac(
            hmac(
                hmac(
                    hmac(
                        'AWS4' + this.config.secretAccessKey,
                        this.amzDate(ws.signDate, true),
                        {hexOutput: false}
                    ),
                    this.config.region,
                    {hexOutput: false, textInput: false}
                ),
                this.config.service,
                {hexOutput: false, textInput: false}
            ),
            'aws4_request',
            {hexOutput: false, textInput: false}
        )
    ws.signature = hmac(signKey, ws.stringToSign, {textInput: false})
  }

    // Build the signature HTTP header using the data in the working set.
  buildSignatureHeader (ws) {
    ws.authorization = 'AWS4-HMAC-SHA256 ' +
            'Credential=' + this.config.accessKeyId + '/' + ws.credentialScope + ', ' +
            'SignedHeaders=' + ws.signedHeaders + ', ' +
            'Signature=' + ws.signature
  }

    // Format the given `Date` as AWS compliant date string.
    // Time part gets omitted if second argument is set to `true`.
  amzDate (date, short) {
    var result = date.toISOString().replace(/[:\-]|\.\d{3}/g, '').substr(0, 17)
    if (short) {
      return result.substr(0, 8)
    }
    return result
  }

    /**
     * Payload serializer factory implementation that converts the data to a JSON string.
     */
  JsonPayloadSerializer () {
    return function (data) {
      return JSON.stringify(data)
    }
  }

    /**
     * Simple URI parser factory.
     * Uses an `a` document element for parsing given URIs.
     * Therefore it most likely will only work in a web browser.
     */
  SimpleUriParser () {
        /**
         * Parse the given URI.
         * @param {string} uri The URI to parse.
         * @returns JavaScript object with the parse results:
         * `protocol`: The URI protocol part.
         * `host`: Host part of the URI.
         * `path`: Path part of the URI, always starting with a `/`
         * `queryParams`: Query parameters as JavaScript object.
         */
    return function (uri) {
      console.log('parsing uri ' + uri)
      let parser = URLParser(uri)
      return {
        protocol: parser.protocol,
        host: parser.host.replace(/^(.*):((80)|(443))$/, '$1'),
        path: ((parser.pathname.charAt(0) !== '/') ? '/' : '') + parser.pathname,
        queryParams: parser.query
      }
    }
  }

    /**
     * Hash factory implementation using the SHA-256 hash algorithm of CryptoJS.
     * Requires at least the CryptoJS rollups: `sha256.js` and `hmac-sha256.js`.
     */
  CryptoJSHasher () {
    return {
            /**
             * Hash the given input using SHA-256 algorithm.
             * The options can be used to control the in-/output of the hash operation.
             * @param {*} input Input data.
             * @param {object} options Options object:
             * `hexOutput` -- Output the hash with hex encoding (default: `true`).
             * `textInput` -- Interpret the input data as text (default: `true`).
             * @returns The generated hash
             */
      hash: (input, options) => {
        options = this.extend({hexOutput: true, textInput: true}, options)
        // var hash = CryptoJS.SHA256(input)
        var hash = crypto.createHash('sha256')
        hash.update(input)
        if (options.hexOutput) {
          return hash.digest('hex')
        }
        return hash.digest()
      },

            /**
             * Create the HMAC of the given input data with the given key using the SHA-256
             * hash algorithm.
             * The options can be used to control the in-/output of the hash operation.
             * @param {string} key Secret key.
             * @param {*} input Input data.
             * @param {object} options Options object:
             * `hexOutput` -- Output the hash with hex encoding (default: `true`).
             * `textInput` -- Interpret the input data as text (default: `true`).
             * @returns The generated HMAC.
             */
      hmac: (key, input, options) => {
        options = this.extend({hexOutput: true, textInput: true}, options)
        // var hmac = CryptoJS.HmacSHA256(input, key, {asBytes: true})
        var hmac = crypto.createHmac('sha256', key)
        hmac.update(input)

        if (options.hexOutput) {
          return hmac.digest('hex')
        }
        return hmac.digest()
      }
    }
  }

    // Simple version of the `extend` function, known from Angular and Backbone.
    // It merges the second (and all succeeding) argument(s) into the object, given as first
    // argument. This is done recursively for all child objects, as well.
  extend (dest) {
    var objs = [].slice.call(arguments, 1)
    objs.forEach((obj) => {
      if (!obj || typeof (obj) !== 'object') {
        return
      }
      Object.keys(obj).forEach((key) => {
        var src = obj[key]
        if (typeof (src) === 'undefined') {
          return
        }
        if (src !== null && typeof (src) === 'object') {
          dest[key] = (Array.isArray(src) ? [] : {})
          this.extend(dest[key], src)
        } else {
          dest[key] = src
        }
      })
    })
    return dest
  }

    // Throw an error if the given object is undefined.
  assertRequired (obj, msg) {
    if (typeof (obj) === 'undefined' || !obj) {
      throw new Error(msg)
    }
  }
}
