/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View
} from 'react-native';

import * as SDKD from './SDKD';

const SDKD_APIKEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhcGlfY2xpZW50X2lkIjoiYWQwZDAyNTYtYjc1MS00OWFlLWJlMmMtYzc2NGM2ZmQ2N2FjIiwiY3JlYXRlZF9hdCI6MTUwNzMxNzg4MH0.jYMLQch_DuvYAzSkMU3O-oFUdJjjQrYdqeZJPE4oUgg';

const instructions = Platform.select({
  ios: 'Press Cmd+R to reload,\n' +
    'Cmd+D or shake for dev menu',
  android: 'Double tap R on your keyboard to reload,\n' +
    'Shake or press menu button for dev menu',
});

export default class App extends Component<{}> {
  constructor(){
    super();
    let w = new SDKD.Wallet(SDKD_APIKEY);
    w.activate('glitch0@gmail.com')
    .then(() => {
      // check balance
      w.getBalance()
      .then((balance) => console.log('balance is '+balance));
    });
  }
  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>
          Welcome to React Native!
        </Text>
        <Text style={styles.instructions}>
          To get started, edit App.js
        </Text>
        <Text style={styles.instructions}>
          {instructions}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5,
  },
});
