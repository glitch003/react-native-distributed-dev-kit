# SDKD Example App w/modules - Ropsten testnet only (for now)

This repository contains 2 things:

* A demo app with tests that tests all modules
* The module sources themselves, for dev and reference purposes

You should be able to clone this repo and get started with the ethereum wallet module immediately.  You will need to obtain an API key which can be done by signing up [here](http://app.sdkd.co)

Replace line 18 of App.js with your own API key.  The one hardcoded is for local dev and will not work. Look for const SDKD_APIKEY = ...

Docs are available here: http://docs.sdkd.co

You can also join our telegram group for live help: https://t.me/sdk_d

To run tests, just use "npm test"

## Installation Instructions

After you've cloned this repo, cd into the repo folder and run these commands

```sh
npm install
./node_modules/.bin/rn-nodeify --hack --install
```