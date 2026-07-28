# Hyperledger Fabric Postal Tracking Network

A distributed parcel tracking system for international logistics built using **Hyperledger Fabric**. The system allows tracking packages across multiple cities and organizations while maintaining data privacy, access controls, and tamper-proof history.

---

## 1. Network Architecture

The network consists of a single channel named `PostalServices` (channel ID: `postalservices`) with the following topology:

- **Org1 (Logistics Corp)**:
  - **Peer 0 (Nairobi)**: Endorsing/committing node (`peer0.org1.example.com`).
  - **Peer 1 (Atlanta)**: Endorsing/committing node (`peer1.org1.example.com`).
  - **Certificate Authority (`ca_org1`)**: Managed identity issuing for Org1.
- **Org2 (Partner Corp)**:
  - **Peer 0 (Singapore)**: Endorsing/committing node (`peer0.org2.example.com`).
  - **Certificate Authority (`ca_org2`)**: Managed identity issuing for Org2.
- **Ordering Service**:
  - Single node Raft orderer (`orderer.example.com`) for sequencing transactions.

---

## 2. Prerequisites

Make sure the following tools are installed in your environment:
- **Docker** & **Docker Compose**

```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable docker --now
docker --version
sudo docker run hello-world

sudo usermod -aG docker $USER
newgrp docker

sudo curl -SL https://github.com/docker/compose/releases/download/v5.1.2/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
docker-compose --version
which docker-compose
```
- **Node.js** (v18 or higher)
- **Hyperledger Fabric Binaries** (`cryptogen` and `configtxgen` in your PATH or under a folder like `../bin`).
  > If Fabric tools are not in your path, you can run the bootstrap script provided by Hyperledger Fabric to download them:
  > ```bash
  > curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.4.0 1.5.0 -d -s
  > ```

---

## 3. Network Deployment

### Step 1: Launch the Blockchain Network
To generate the crypto material, compile channel configuration artifacts, spin up the Docker containers, establish the channel, and commit the smart contract, execute:

```bash
cd network
./deploy.sh
```

This script automates:
1. Generation of cryptographic certificates using `cryptogen`.
2. Compilation of channel genesis blocks using `configtxgen`.
3. Launch of all nodes (`orderer`, `peer0.org1`, `peer1.org1`, `peer0.org2`, `ca_org1`, `ca_org2`, and `cli`).
4. Joining all peers to the `postalservices` channel.
5. Packaging and installing the Node.js smart contract on all peers, approving the definition for each organization, and committing it.

### Step 2: Connection Profiles
The client application connects to the network using the `connection-org1.json` and `connection-org2.json` profiles. Because Service Discovery is disabled by default (`discovery: { enabled: false }` in `cli.js`), it relies on explicitly defining all endorsing peers in the channel configuration of the profile. Both `peer0.org1.example.com` and `peer0.org2.example.com` are required in each organization's `peers` section to successfully submit transactions that require cross-organization endorsement.

---

## 4. Client Application & CLI

The CLI client interacts with the network using the Fabric SDK.

### Step 1: Install Dependencies
Navigate to the `cli/` directory and install the required npm packages:

```bash
cd ../cli
npm install
```

### Step 2: Enroll the CA Admins
Before creating user certificates, the Organization CA Admins must be enrolled:

```bash
# Enroll Admin for Org1
node enrollAdmin.js org1

# Enroll Admin for Org2
node enrollAdmin.js org2
```
This stores the Admin certificate in the file system wallet (`cli/wallet/org1/admin.id` and `cli/wallet/org2/admin.id`).

### Step 3: Use the CLI Commands
All interactions are carried out via the main CLI tool `cli.js`.

#### 1. Create a New User (Employee)
Create identities with the role of a postal employee:
```bash
node cli.js create-user john org1
node cli.js create-user lee org2
```
> [!NOTE]
> **Troubleshooting**: If you get an error `Identity 'john' is already registered`, but you also see `Identity for user "john" does not exist in the wallet` when running commands, it means your local `wallet/` directory was deleted while the Certificate Authority (CA) database was retained. To fix this, you must either use a new username (e.g., `john2`), or completely reset the network using `./deploy.sh down` and `./deploy.sh up`.


#### 2. Create a New Parcel
```bash
# syntax: node cli.js create-parcel <username> <org> <parcelId> <destination> <currentAddress>
node cli.js create-parcel john org1 PARCEL001 "London" "Nairobi Sorting Center"
```

#### 3. Query Parcel Details
```bash
# syntax: node cli.js query-parcel <username> <org> <parcelId>
node cli.js query-parcel john org1 PARCEL001
```

#### 4. Transport a Parcel (Update Address)
This updates the parcel's current location and triggers a `DistributionEvent` which will be logged in the console:
```bash
# syntax: node cli.js transport <username> <org> <parcelId> <newAddress>
node cli.js transport john org1 PARCEL001 "Mombasa Transit Hub"
```

#### 5. Change Parcel Status
Modify the state of the package (status options: `Good`, `Damaged`, `Destroyed`):
```bash
# syntax: node cli.js change-status <username> <org> <parcelId> <newStatus>
node cli.js change-status lee org2 PARCEL001 Damaged
```

**Verification of State Transitions**:
If you attempt to transition the parcel from a degraded status back to a better one (e.g. `Damaged` to `Good`), the smart contract will reject the transaction. Status can only degrade.
```bash
node cli.js change-status lee org2 PARCEL001 Good
```
*Expected Error:*
```text
Failed to submit transaction: No valid responses from any peers. Errors:
    peer=peer0.org2.example.com, status=500, message=Invalid state transition: Cannot upgrade status from Damaged to Good
    peer=peer0.org1.example.com, status=500, message=Invalid state transition: Cannot upgrade status from Damaged to Good
```

---

## 5. Architectural Q&A (For Auditor / Stakeholder Review)

### Q1: How well does the network architecture support multi-organization collaboration?
- **Response**: The architecture leverages a dedicated channel (`PostalServices`) separating transactions from general visibility. Anchor peers are defined for both organizations (`Org1` and `Org2`) enabling cross-organization peer discovery. The chaincode requires approval and endorsement from both organizations (`Org1` and `Org2`) before a transaction can be committed to the shared ledger, ensuring consensus and trust among the collaborating logistic partners.

### Q2: How secure is the user authentication and authorization system?
- **Response**: Access is secured via two distinct layers:
  1. **PKI & CA**: Every user identity (e.g. postal employee) is generated, signed, and certified by their respective Organization Certificate Authority (`ca_org1` and `ca_org2`). Private keys are stored in a secure local file system wallet.
  2. **Smart Contract Rules**: The chaincode checks client credentials (`ctx.clientIdentity.getMSPID()`) to verify the caller's organization. Any unauthorized MSP attempting to mutate state will trigger an authorization failure.

### Q3: How effectively does the chaincode manage parcel state transitions?
- **Response**: The state transitions are enforced deterministically on-chain inside `postal-contract.js`. The state can only degrade (`Good` -> `Damaged` -> `Destroyed`). Once a package is marked as `Destroyed`, it can no longer be transported or have its status modified. Any attempt to upgrade status (e.g., `Damaged` back to `Good`) will fail the validation check and throw an error, preventing malicious state changes.
