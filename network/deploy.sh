#!/bin/bash

# Ensure binaries are available, adjust path as necessary
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}

echo "Stopping and removing existing containers..."
docker-compose down -v
sudo rm -rf crypto-config channel-artifacts organizations/fabric-ca/org1/* organizations/fabric-ca/org2/*

mkdir -p channel-artifacts organizations/fabric-ca/org1 organizations/fabric-ca/org2

echo "Generating crypto material..."
cryptogen generate --config=./crypto-config.yaml --output="crypto-config"

echo "Generating system genesis block and channel transaction..."
# 1. Generate System Channel Block for the Orderer
configtxgen -profile OrdererGenesis -outputBlock ./channel-artifacts/genesis.block -channelID system-channel
# 2. Generate Application Channel Transaction for the Peers
configtxgen -profile PostalServicesChannel -outputCreateChannelTx ./channel-artifacts/postalservices.tx -channelID postalservices

echo "Starting network..."
docker-compose up -d

echo "Waiting for network to start..."
sleep 10

echo "Creating and Joining channel..."
docker exec cli bash -c "./scripts/joinChannel.sh"

echo "Deploying chaincode..."
docker exec cli bash -c "./scripts/deployChaincode.sh"

echo "Network deployment complete."