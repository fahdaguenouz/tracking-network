'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const PostalContract = require('../lib/postal-contract');

describe('PostalContract Unit Tests', () => {
  let contract;
  let ctx;
  let parcelSample;

  beforeEach(() => {
    contract = new PostalContract();
    
    // Mock Chaincode Stub
    const stub = {
      putState: sinon.stub().resolves(),
      getState: sinon.stub(),
      setEvent: sinon.stub().resolves()
    };

    // Mock Client Identity
    const clientIdentity = {
      getMSPID: sinon.stub().returns('Org1MSP'),
      getAttributeValue: sinon.stub().returns('employee')
    };

    ctx = { stub, clientIdentity };

    parcelSample = {
      docType: 'parcel',
      destination: 'Nairobi',
      currentAddress: 'Atlanta',
      status: 'Good'
    };
  });

  describe('#createParcel', () => {
    it('should create a parcel successfully with status Good', async () => {
      ctx.stub.getState.resolves(Buffer.from('')); // Parcel does not exist

      const resultStr = await contract.createParcel(ctx, 'P1', 'Nairobi', 'Atlanta');
      const result = JSON.parse(resultStr);

      expect(result.destination).to.equal('Nairobi');
      expect(result.currentAddress).to.equal('Atlanta');
      expect(result.status).to.equal('Good');
      expect(ctx.stub.putState.calledOnce).to.be.true;
    });

    it('should throw an error if the parcel already exists', async () => {
      ctx.stub.getState.resolves(Buffer.from(JSON.stringify(parcelSample)));

      try {
        await contract.createParcel(ctx, 'P1', 'Nairobi', 'Atlanta');
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.message).to.equal('The parcel P1 already exists');
      }
    });

    it('should throw an error if caller is not authorized', async () => {
      ctx.clientIdentity.getMSPID.returns('UnauthorizedMSP');

      try {
        await contract.createParcel(ctx, 'P1', 'Nairobi', 'Atlanta');
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.message).to.include('Unauthorized');
      }
    });
  });

  describe('#transport', () => {
    it('should update current address and emit a DistributionEvent', async () => {
      ctx.stub.getState.resolves(Buffer.from(JSON.stringify(parcelSample)));

      const resultStr = await contract.transport(ctx, 'P1', 'Singapore');
      const result = JSON.parse(resultStr);

      expect(result.currentAddress).to.equal('Singapore');
      expect(ctx.stub.putState.calledOnce).to.be.true;
      expect(ctx.stub.setEvent.calledOnce).to.be.true;

      const eventArgs = ctx.stub.setEvent.getCall(0).args;
      expect(eventArgs[0]).to.equal('DistributionEvent');
      const eventPayload = JSON.parse(eventArgs[1].toString());
      expect(eventPayload.from).to.equal('Atlanta');
      expect(eventPayload.to).to.equal('Singapore');
    });

    it('should throw an error if parcel is Destroyed', async () => {
      parcelSample.status = 'Destroyed';
      ctx.stub.getState.resolves(Buffer.from(JSON.stringify(parcelSample)));

      try {
        await contract.transport(ctx, 'P1', 'Singapore');
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.message).to.equal('Cannot transport parcel P1: status is Destroyed');
      }
    });
  });

  describe('#changeStatus', () => {
    it('should degrade status from Good to Damaged', async () => {
      ctx.stub.getState.resolves(Buffer.from(JSON.stringify(parcelSample)));

      const resultStr = await contract.changeStatus(ctx, 'P1', 'Damaged');
      const result = JSON.parse(resultStr);

      expect(result.status).to.equal('Damaged');
    });

    it('should degrade status from Damaged to Destroyed', async () => {
      parcelSample.status = 'Damaged';
      ctx.stub.getState.resolves(Buffer.from(JSON.stringify(parcelSample)));

      const resultStr = await contract.changeStatus(ctx, 'P1', 'Destroyed');
      const result = JSON.parse(resultStr);

      expect(result.status).to.equal('Destroyed');
    });

    it('should throw an error when attempting to upgrade status from Damaged to Good', async () => {
      parcelSample.status = 'Damaged';
      ctx.stub.getState.resolves(Buffer.from(JSON.stringify(parcelSample)));

      try {
        await contract.changeStatus(ctx, 'P1', 'Good');
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.message).to.equal('Invalid state transition: Cannot upgrade status from Damaged to Good');
      }
    });

    it('should throw an error when attempting to change status of Destroyed parcel', async () => {
      parcelSample.status = 'Destroyed';
      ctx.stub.getState.resolves(Buffer.from(JSON.stringify(parcelSample)));

      try {
        await contract.changeStatus(ctx, 'P1', 'Damaged');
        throw new Error('Should have failed');
      } catch (err) {
        expect(err.message).to.equal('Invalid state transition: Cannot change status from Destroyed to Damaged');
      }
    });
  });
});
