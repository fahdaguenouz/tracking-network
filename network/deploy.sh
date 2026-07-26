#!/bin/bash

# Ensure binaries are available, adjust path as necessary
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}

echo "Stopping and removing existing containers..."
docker-compose down -v
rm -rf crypto-config system-genesis-block organizations/fabric-ca/org1/* organizations/fabric-ca/org2/*

mkdir -p system-genesis-block organizations/fabric-ca/org1 organizations/fabric-ca/org2

echo "Generating crypto material..."
cryptogen generate --config=./crypto-config.yaml --output="crypto-config"

echo "Generating channel genesis block..."
configtxgen -profile PostalServicesChannel -outputBlock ./system-genesis-block/genesis.block -channelID postalservices

echo "Starting network..."
docker-compose up -d

echo "Waiting for network to start..."
sleep 10

echo "Joining peers to the channel..."
docker exec cli bash -c "./scripts/joinChannel.sh"

echo "Deploying chaincode..."
docker exec cli bash -c "./scripts/deployChaincode.sh"

echo "Network deployment complete."
