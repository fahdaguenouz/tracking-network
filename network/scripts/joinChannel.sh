#!/bin/bash

. scripts/envVar.sh

CHANNEL_NAME="postalservices"
GENESIS_BLOCK="./channel-artifacts/genesis.block"

echo "Joining peer0.org1 (Nairobi) to the channel..."
setGlobals 1 0
peer channel join -b $GENESIS_BLOCK

echo "Joining peer1.org1 (Atlanta) to the channel..."
setGlobals 1 1
peer channel join -b $GENESIS_BLOCK

echo "Joining peer0.org2 (Singapore) to the channel..."
setGlobals 2 0
peer channel join -b $GENESIS_BLOCK
