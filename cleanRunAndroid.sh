#!/bin/bash

cd android
./gradlew uninstallDebug
cd ..
react-native run-android
