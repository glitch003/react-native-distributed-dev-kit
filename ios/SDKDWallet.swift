//
//  SDKDWallet.swift
//  DevKitTestApp
//
//  Created by Chris on 11/9/17.
//  Copyright © 2017 Facebook. All rights reserved.
//

import Foundation

@objc(SDKDWallet)
class SDKDWallet : RCTEventEmitter {

  func callRNFunc(){
    print("test func called")
    print(self.bridge)
    self.sendEvent(withName: "SDKDWalletEvent", body: ["test": "thing"])
  }

  override func supportedEvents() -> [String]! {
    return ["SDKDWalletEvent"]
  }

  override func startObserving() {
    NotificationCenter.default.addObserver(self, selector: #selector(callRNFunc), name: NSNotification.Name(rawValue: "event-emitted"), object: nil)
  }

  override func stopObserving() {
    NotificationCenter.default.removeObserver(self)
  }

  static func callTestEvent(){
    NotificationCenter.default.post(name: NSNotification.Name(rawValue: "event-emitted"), object: self, userInfo: nil)
  }


}
