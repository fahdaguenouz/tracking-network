#!/usr/bin/env node
'use strict';

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

function resolveCCP(ccp, baseDir) {
  const resolvePath = (p) => (p && !path.isAbsolute(p) ? path.resolve(baseDir, p) : p);
  for (const section of ['peers', 'orderers', 'certificateAuthorities']) {
    if (ccp[section]) {
      for (const key of Object.keys(ccp[section])) {
        if (ccp[section][key].tlsCACerts && ccp[section][key].tlsCACerts.path) {
          ccp[section][key].tlsCACerts.path = resolvePath(ccp[section][key].tlsCACerts.path);
        }
      }
    }
  }
  return ccp;
}

// Helper to get connection profile and wallet
async function getNetworkGateway(org, username) {
  const ccpPath = path.resolve(__dirname, `connection-${org}.json`);
  if (!fs.existsSync(ccpPath)) {
    throw new Error(`Connection profile not found at ${ccpPath}`);
  }
  const rawCCP = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
  const ccp = resolveCCP(rawCCP, __dirname);

  const walletPath = path.join(__dirname, 'wallet', org);
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  const identity = await wallet.get(username);
  if (!identity) {
    throw new Error(`Identity for user "${username}" does not exist in the wallet. Register/Enroll them first.`);
  }

  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity: username,
    discovery: { enabled: false, asLocalhost: true }
  });

  return { gateway, ccp };
}

// Commands implementationa
const argv = yargs(hideBin(process.argv))
  .command(
    'create-user <username> <org>',
    'Register and enroll a new postal employee user',
    (y) => {
      y.positional('username', { describe: 'Name of the user to create', type: 'string' })
       .positional('org', { describe: 'Organization of the user (org1 or org2)', type: 'string', choices: ['org1', 'org2'] });
    },
    async (args) => {
      const { username, org } = args;
      try {
        const ccpPath = path.resolve(__dirname, `connection-${org}.json`);
        const rawCCP = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        const ccp = resolveCCP(rawCCP, __dirname);

        const caInfo = ccp.certificateAuthorities[`ca.${org}.example.com`];
        const caTLSCACertsPath = caInfo.tlsCACerts.path;
        let caTLSCACerts;
        if (fs.existsSync(caTLSCACertsPath)) {
          caTLSCACerts = fs.readFileSync(caTLSCACertsPath);
        }
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const walletPath = path.join(__dirname, 'wallet', org);
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // Check if user already exists
        const userExists = await wallet.get(username);
        if (userExists) {
          console.log(`An identity for the user "${username}" already exists in the wallet`);
          return;
        }

        // Check if admin exists to register the user
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
          console.log('An identity for the admin user "admin" does not exist in the wallet');
          console.log('Please enroll the admin first using: node enrollAdmin.js ' + org);
          return;
        }

        // Build a user object for enrollment
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register the user
        const secret = await ca.register({
          affiliation: org === 'org1' ? 'org1.department1' : 'org2.department1',
          enrollmentID: username,
          role: 'client',
          attrs: [{ name: 'role', value: 'employee', ecert: true }]
        }, adminUser);

        // Enroll the user
        const enrollment = await ca.enroll({
          enrollmentID: username,
          enrollmentSecret: secret
        });

        const x509Identity = {
          credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
          },
          mspId: org === 'org1' ? 'Org1MSP' : 'Org2MSP',
          type: 'X.509',
        };

        await wallet.put(username, x509Identity);
        console.log(`Successfully registered and enrolled user "${username}" and imported it into the wallet`);

      } catch (error) {
        console.error(`Failed to register user "${username}": ${error.message}`);
        process.exit(1);
      }
    }
  )
  .command(
    'create-parcel <username> <org> <parcelId> <destination> <currentAddress>',
    'Create a new parcel asset',
    (y) => {
      y.positional('username', { type: 'string' })
       .positional('org', { type: 'string', choices: ['org1', 'org2'] })
       .positional('parcelId', { type: 'string' })
       .positional('destination', { type: 'string' })
       .positional('currentAddress', { type: 'string' });
    },
    async (args) => {
      const { username, org, parcelId, destination, currentAddress } = args;
      let gateway;
      try {
        const res = await getNetworkGateway(org, username);
        gateway = res.gateway;

        const network = await gateway.getNetwork('postalservices');
        const contract = network.getContract('postal');

        console.log(`Submitting createParcel transaction for parcel ${parcelId}...`);
        const result = await contract.submitTransaction('createParcel', parcelId, destination, currentAddress);
        console.log(`Transaction response: ${result.toString()}`);
        console.log(`Parcel ${parcelId} created successfully!`);

      } catch (error) {
        console.error(`Failed to submit transaction: ${error.message}`);
        process.exit(1);
      } finally {
        if (gateway) await gateway.disconnect();
      }
    }
  )
  .command(
    'transport <username> <org> <parcelId> <newAddress>',
    'Update a parcel\'s current address',
    (y) => {
      y.positional('username', { type: 'string' })
       .positional('org', { type: 'string', choices: ['org1', 'org2'] })
       .positional('parcelId', { type: 'string' })
       .positional('newAddress', { type: 'string' });
    },
    async (args) => {
      const { username, org, parcelId, newAddress } = args;
      let gateway;
      try {
        const res = await getNetworkGateway(org, username);
        gateway = res.gateway;

        const network = await gateway.getNetwork('postalservices');
        const contract = network.getContract('postal');

        // Set up event listener to capture the distribution event
        let eventReceived = false;
        const listener = async (event) => {
          if (event.eventName === 'DistributionEvent') {
            const eventData = JSON.parse(event.payload.toString());
            console.log(`\n[EVENT RECEIVED] DistributionEvent:`);
            console.log(`  Parcel ID: ${eventData.parcelId}`);
            console.log(`  From Address: ${eventData.from}`);
            console.log(`  To Address: ${eventData.to}`);
            console.log(`  Destination: ${eventData.destination}`);
            console.log(`  Status: ${eventData.status}`);
            eventReceived = true;
          }
        };
        await contract.addContractListener(listener);

        console.log(`Submitting transport transaction for parcel ${parcelId}...`);
        const result = await contract.submitTransaction('transport', parcelId, newAddress);
        console.log(`Transaction response: ${result.toString()}`);
        console.log(`Parcel ${parcelId} transported to ${newAddress} successfully!`);

        // Wait a brief moment to receive the event
        await new Promise((resolve) => setTimeout(resolve, 2000));
        contract.removeContractListener(listener);

      } catch (error) {
        console.error(`Failed to submit transaction: ${error.message}`);
        process.exit(1);
      } finally {
        if (gateway) await gateway.disconnect();
      }
    }
  )
  .command(
    'change-status <username> <org> <parcelId> <newStatus>',
    'Change the status of a parcel (Good, Damaged, or Destroyed)',
    (y) => {
      y.positional('username', { type: 'string' })
       .positional('org', { type: 'string', choices: ['org1', 'org2'] })
       .positional('parcelId', { type: 'string' })
       .positional('newStatus', { type: 'string', choices: ['Good', 'Damaged', 'Destroyed'] });
    },
    async (args) => {
      const { username, org, parcelId, newStatus } = args;
      let gateway;
      try {
        const res = await getNetworkGateway(org, username);
        gateway = res.gateway;

        const network = await gateway.getNetwork('postalservices');
        const contract = network.getContract('postal');

        console.log(`Submitting changeStatus transaction for parcel ${parcelId} to status "${newStatus}"...`);
        const result = await contract.submitTransaction('changeStatus', parcelId, newStatus);
        console.log(`Transaction response: ${result.toString()}`);
        console.log(`Parcel ${parcelId} status changed to ${newStatus} successfully!`);

      } catch (error) {
        console.error(`Failed to submit transaction: ${error.message}`);
        process.exit(1);
      } finally {
        if (gateway) await gateway.disconnect();
      }
    }
  )
  .command(
    'query-parcel <username> <org> <parcelId>',
    'Query the details of a parcel',
    (y) => {
      y.positional('username', { type: 'string' })
       .positional('org', { type: 'string', choices: ['org1', 'org2'] })
       .positional('parcelId', { type: 'string' });
    },
    async (args) => {
      const { username, org, parcelId } = args;
      let gateway;
      try {
        const res = await getNetworkGateway(org, username);
        gateway = res.gateway;

        const network = await gateway.getNetwork('postalservices');
        const contract = network.getContract('postal');

        console.log(`Evaluating queryParcel transaction for parcel ${parcelId}...`);
        const result = await contract.evaluateTransaction('queryParcel', parcelId);
        console.log(`Parcel details:\n${JSON.stringify(JSON.parse(result.toString()), null, 2)}`);

      } catch (error) {
        console.error(`Failed to evaluate transaction: ${error.message}`);
        process.exit(1);
      } finally {
        if (gateway) await gateway.disconnect();
      }
    }
  )
  .demandCommand(1, 'Please specify a valid command.')
  .help()
  .argv;
