#!/bin/bash
set -euo pipefail

export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}

command -v docker >/dev/null 2>&1 || { echo "docker is not installed"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "docker-compose is not installed"; exit 1; }

echo "Stopping and removing existing containers..."
docker-compose down -v || true
sudo rm -rf crypto-config channel-artifacts organizations/fabric-ca/org1/* organizations/fabric-ca/org2/*

mkdir -p channel-artifacts organizations/fabric-ca/org1 organizations/fabric-ca/org2

echo "Generating crypto material..."
cryptogen generate --config=./crypto-config.yaml --output="crypto-config"

echo "Generating system genesis block and channel transaction..."
configtxgen -profile OrdererGenesis -outputBlock ./channel-artifacts/genesis.block -channelID system-channel
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