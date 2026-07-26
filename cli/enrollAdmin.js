'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    const org = process.argv[2];
    if (!org || (org !== 'org1' && org !== 'org2')) {
      console.error('Usage: node enrollAdmin.js <org1|org2>');
      process.exit(1);
    }

    // load the connection profile
    const ccpPath = path.resolve(__dirname, `connection-${org}.json`);
    if (!fs.existsSync(ccpPath)) {
      throw new Error(`Connection profile not found at ${ccpPath}`);
    }
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Create a new CA client for interacting with the CA.
    const caInfo = ccp.certificateAuthorities[`ca.${org}.example.com`];
    const caTLSCACertsPath = path.resolve(__dirname, caInfo.tlsCACerts.path);
    
    let caTLSCACerts;
    if (fs.existsSync(caTLSCACertsPath)) {
      caTLSCACerts = fs.readFileSync(caTLSCACertsPath);
    } else {
      console.warn(`WARNING: TLS CA Certificate not found at ${caTLSCACertsPath}. Proceeding without trusted roots.`);
    }

    const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

    // Create a new file system based wallet for managing identities.
    const walletPath = path.join(process.cwd(), 'wallet', org);
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    // Check to see if we've already enrolled the admin user.
    const identity = await wallet.get('admin');
    if (identity) {
      console.log('An identity for the admin user "admin" already exists in the wallet');
      return;
    }

    // Enroll the admin user, and import the new identity into the wallet.
    const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: org === 'org1' ? 'Org1MSP' : 'Org2MSP',
      type: 'X.509',
    };
    await wallet.put('admin', x509Identity);
    console.log('Successfully enrolled admin user "admin" and imported it into the wallet');

  } catch (error) {
    console.error(`Failed to enroll admin user "admin": ${error}`);
    process.exit(1);
  }
}

main();
