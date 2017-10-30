import 'react-native'
import React from 'react'
import App from '../App'

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer'

jest.mock('WebView', () => 'WebView')

jest.mock('NativeModules', () => {
  return {
    RNRandomBytes: {
      seed: undefined,
      randomBytes: jest.fn()
    }
  }
})

it('renders correctly', () => {
  const tree = renderer.create(
    <App />
  ).toJSON()
  expect(tree).toMatchSnapshot()
})
