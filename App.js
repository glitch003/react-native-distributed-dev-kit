/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component } from 'react'
import {
  Platform,
  StyleSheet,
  Text,
  View
} from 'react-native'

import * as SDKD from '@sdkd/sdkd'
import * as SDKDMod from '@sdkd/sdkd-wallet'

// const SDKD_APIKEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcGlfY2xpZW50X2lkIjoiYWQwZDAyNTYtYjc1MS00OWFlLWJlMmMtYzc2NGM2ZmQ2N2FjIiwiY3JlYXRlZF9hdCI6MTUwNzMxNzg4MH0.jYMLQch_DuvYAzSkMU3O-oFUdJjjQrYdqeZJPE4oUgg' // heroku
const SDKD_APIKEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcGlfY2xpZW50X2lkIjoiNGVkNTNiYTAtNTRjYy00M2QwLTk4MDgtZGZiMTY2ZDhhMmI4IiwiY3JlYXRlZF9hdCI6MTUwNzIzNjQ4OH0.z4_h_4iTCYyv0OMCqe6RE0XEvM_DIagTR3lfRbQt74w' // local

const instructions = Platform.select({
  ios: 'Press Cmd+R to reload,\n' +
    'Cmd+D or shake for dev menu',
  android: 'Double tap R on your keyboard to reload,\n' +
    'Shake or press menu button for dev menu'
})

export default class App extends React.Component {
  constructor () {
    super()
    this.state = {
      wallet: false,
      balance: 'loading...'
    }
  }
  componentWillMount () {
    SDKD.Config.init(SDKD_APIKEY)
    let w = new SDKDMod.Wallet()
    w.activate('glitch0@gmail.com')
    .then(() => {
      this.setState({wallet: w})
      // check balance
      console.log('[SDKD]: checking balance')
      return w.getBalance()
    })
    .then(balance => {
      console.log('[SDKD]: setting balance')
      this.setState({balance})
      // if(balance > 0){
      //   // try sending tx
      //   return w.sendTx('0x164f64dac95870b7b1261e233221778b1186102a', 100);
      // }
    })
    // .then(txData => console.log(txData))
    .catch(err => { throw new Error(err) })
  }
  render () {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>
          Welcome to React Native!
        </Text>
        <Text>
          Your balance is {this.state.balance} Wei
        </Text>
        {this.state.wallet ? this.state.wallet.renderAddressQRCode() : null}
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF'
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5
  }
})
