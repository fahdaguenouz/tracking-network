#!/bin/bash

. scripts/envVar.sh

CHANNEL_NAME="postalservices"

echo "Creating channel on the Orderer..."
setGlobals 1 0
peer channel create -o orderer.example.com:7050 -c $CHANNEL_NAME -f ./channel-artifacts/postalservices.tx --outputBlock ./channel-artifacts/${CHANNEL_NAME}.block --tls --cafile $ORDERER_CA

echo "Joining peer0.org1 (Nairobi) to the channel..."
peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block

echo "Joining peer1.org1 (Atlanta) to the channel..."
setGlobals 1 1
peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block

echo "Joining peer0.org2 (Singapore) to the channel..."
setGlobals 2 0
peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block