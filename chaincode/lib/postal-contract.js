'use strict';

const { Contract } = require('fabric-contract-api');

class PostalContract extends Contract {

  // Helper to verify if caller is an authorized employee
  async _checkEmployeeRole(ctx) {
    // In a real production network, we can verify custom attributes:
    // const role = ctx.clientIdentity.getAttributeValue('role');
    // if (role !== 'employee') {
    //     throw new Error('Unauthorized: Only postal employees can perform this action.');
    // }
    
    // For this implementation, we will check if the user is from Org1MSP or Org2MSP.
    const mspId = ctx.clientIdentity.getMSPID();
    if (mspId !== 'Org1MSP' && mspId !== 'Org2MSP') {
      throw new Error(`Unauthorized: Client MSP ${mspId} is not allowed to perform operations`);
    }
  }

  // Init ledger (optional)
  async initLedger(ctx) {
    console.info('============= START : Initialize Ledger ===========');
    console.info('============= END : Initialize Ledger ===========');
  }

  // Create a new parcel asset
  async createParcel(ctx, id, destination, currentAddress) {
    await this._checkEmployeeRole(ctx);

    const exists = await this.parcelExists(ctx, id);
    if (exists) {
      throw new Error(`The parcel ${id} already exists`);
    }

    const parcel = {
      docType: 'parcel',
      destination,
      currentAddress,
      status: 'Good' // Initial status is always 'Good'
    };

    await ctx.stub.putState(id, Buffer.from(JSON.stringify(parcel)));
    
    console.info(`Parcel ${id} created successfully.`);
    return JSON.stringify(parcel);
  }

  // Query parcel by ID
  async queryParcel(ctx, id) {
    const parcelBytes = await ctx.stub.getState(id);
    if (!parcelBytes || parcelBytes.length === 0) {
      throw new Error(`The parcel ${id} does not exist`);
    }
    return parcelBytes.toString();
  }

  // Check if parcel exists
  async parcelExists(ctx, id) {
    const parcelBytes = await ctx.stub.getState(id);
    return parcelBytes && parcelBytes.length > 0;
  }

  // Transport transaction - modify parcel's address
  async transport(ctx, id, newAddress) {
    await this._checkEmployeeRole(ctx);

    const parcelBytes = await ctx.stub.getState(id);
    if (!parcelBytes || parcelBytes.length === 0) {
      throw new Error(`The parcel ${id} does not exist`);
    }

    const parcel = JSON.parse(parcelBytes.toString());

    // Validation: Cannot transport a destroyed parcel
    if (parcel.status === 'Destroyed') {
      throw new Error(`Cannot transport parcel ${id}: status is Destroyed`);
    }

    const oldAddress = parcel.currentAddress;
    parcel.currentAddress = newAddress;

    await ctx.stub.putState(id, Buffer.from(JSON.stringify(parcel)));

    // Emit event
    const eventPayload = {
      parcelId: id,
      from: oldAddress,
      to: newAddress,
      destination: parcel.destination,
      status: parcel.status
    };
    await ctx.stub.setEvent('DistributionEvent', Buffer.from(JSON.stringify(eventPayload)));

    return JSON.stringify(parcel);
  }

  // Change status of a parcel
  async changeStatus(ctx, id, newStatus) {
    await this._checkEmployeeRole(ctx);

    const validStatuses = ['Good', 'Damaged', 'Destroyed'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be Good, Damaged, or Destroyed`);
    }

    const parcelBytes = await ctx.stub.getState(id);
    if (!parcelBytes || parcelBytes.length === 0) {
      throw new Error(`The parcel ${id} does not exist`);
    }

    const parcel = JSON.parse(parcelBytes.toString());
    const oldStatus = parcel.status;

    // Rules that status can only degrade: Good -> Damaged -> Destroyed
    if (oldStatus === 'Destroyed' && newStatus !== 'Destroyed') {
      throw new Error(`Invalid state transition: Cannot change status from Destroyed to ${newStatus}`);
    }

    if (oldStatus === 'Damaged' && newStatus === 'Good') {
      throw new Error(`Invalid state transition: Cannot upgrade status from Damaged to Good`);
    }

    parcel.status = newStatus;
    await ctx.stub.putState(id, Buffer.from(JSON.stringify(parcel)));

    return JSON.stringify(parcel);
  }
}

module.exports = PostalContract;
