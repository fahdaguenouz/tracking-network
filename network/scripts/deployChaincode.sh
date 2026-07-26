#!/bin/bash

. scripts/envVar.sh

CHANNEL_NAME="postalservices"
CC_NAME="postal"
CC_SRC_PATH="/opt/gopath/src/github.com/chaincode"
CC_VERSION="1.0"
CC_SEQUENCE="1"

echo "Packaging chaincode..."
peer lifecycle chaincode package ${CC_NAME}.tar.gz --path ${CC_SRC_PATH} --lang node --label ${CC_NAME}_${CC_VERSION}

echo "Installing chaincode on peer0.org1 (Nairobi)..."
setGlobals 1 0
peer lifecycle chaincode install ${CC_NAME}.tar.gz

echo "Installing chaincode on peer1.org1 (Atlanta)..."
setGlobals 1 1
peer lifecycle chaincode install ${CC_NAME}.tar.gz

echo "Installing chaincode on peer0.org2 (Singapore)..."
setGlobals 2 0
peer lifecycle chaincode install ${CC_NAME}.tar.gz

echo "Querying installed chaincode to get Package ID..."
setGlobals 1 0
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "${CC_NAME}_${CC_VERSION}" | sed -n 's/^Package ID: //; s/, Label:.*$//p')

if [ -z "$PACKAGE_ID" ]; then
  echo "Failed to find Package ID for chaincode ${CC_NAME}_${CC_VERSION}"
  exit 1
fi

echo "Package ID is: ${PACKAGE_ID}"

echo "Approving chaincode for Org1..."
setGlobals 1 0
peer lifecycle chaincode approveformyorg -o orderer.example.com:7050 --ordererTLSHostnameOverride orderer.example.com --channelID ${CHANNEL_NAME} --name ${CC_NAME} --version ${CC_VERSION} --package-id ${PACKAGE_ID} --sequence ${CC_SEQUENCE} --tls --cafile ${ORDERER_CA}

echo "Approving chaincode for Org2..."
setGlobals 2 0
peer lifecycle chaincode approveformyorg -o orderer.example.com:7050 --ordererTLSHostnameOverride orderer.example.com --channelID ${CHANNEL_NAME} --name ${CC_NAME} --version ${CC_VERSION} --package-id ${PACKAGE_ID} --sequence ${CC_SEQUENCE} --tls --cafile ${ORDERER_CA}

echo "Committing chaincode to channel..."
peer lifecycle chaincode commit -o orderer.example.com:7050 --ordererTLSHostnameOverride orderer.example.com --channelID ${CHANNEL_NAME} --name ${CC_NAME} --version ${CC_VERSION} --sequence ${CC_SEQUENCE} --tls --cafile ${ORDERER_CA} \
  --peerAddresses peer0.org1.example.com:7051 --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses peer0.org2.example.com:9051 --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt

echo "Chaincode deployed successfully!"
