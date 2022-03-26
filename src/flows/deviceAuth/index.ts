import {
  receiveAnyCommand,
  receiveCommand,
  sendData
} from '@cypherock/communication';

import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions } from '../index';

import { verifyChallengeSignature, verifySerialSignature } from './helper';

export interface DeviceAuthenticatorRunOptions extends CyFlowRunOptions {
  firmwareVersion: string;
  mockAuth?: boolean;
  inTestApp: boolean;
}

export class DeviceAuthenticator extends CyFlow {
  constructor() {
    super();
  }

  async run({
    connection,
    packetVersion,
    firmwareVersion,
    mockAuth,
    inTestApp
  }: DeviceAuthenticatorRunOptions) {
    this.cancelled = false;
    let flowInterupted = false;

    try {
      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        await sendData(connection, 83, '01', packetVersion);
        const data: any = await receiveAnyCommand(
          connection,
          [85, 83],
          packetVersion,
          30000
        );

        if (data.commandType === 83) {
          this.emit('confirmed', false);
          return;
        }

        this.emit('confirmed', true);
        let serial;
        let serialSignature;

        let serialPostfix1;
        let serialPostfix2;

        if (data.data.length > 192) {
          serialPostfix1 = data.data.slice(0, 14); // 7 byte
          serialPostfix2 = data.data.slice(14, 60); // 23 byte

          serialSignature = data.data.slice(60, 188).toUpperCase(); // 64 byte
          serial = data.data.slice(188, 252).toUpperCase(); // 32 byte
        } else {
          serial = data.data.slice(0, 64).toUpperCase(); // 32 byte
          serialSignature = data.data.slice(64, data.data.length); // 64 byte
        }

        logger.info('Serial and sig', {
          serial,
          serialSignature,
          serialPostfix1,
          serialPostfix2
        });

        let challenge;
        this.emit('serial', (serial + '').toLowerCase());

        if (mockAuth) {
          challenge =
            'b5845a20874dc18196ec1cd473f400779cc1d1ede8374d773b3d98a66affea59';
        } else {
          challenge = await verifySerialSignature(
            serial,
            serialSignature,
            serialPostfix1,
            serialPostfix2
          );
        }

        if (!challenge) {
          this.emit('verified', false);
          await sendData(connection, 83, '04', packetVersion);
          return;
        }

        await sendData(connection, 83, '02' + challenge, packetVersion);

        const challengeHash: any = await receiveCommand(
          connection,
          86,
          packetVersion,
          10000
        );

        let challengeSignature: string;
        let challengePostfix1: string | undefined;
        let challengePostfix2: string | undefined;

        if (challengeHash.length > 128) {
          challengePostfix1 = challengeHash.slice(0, 14); // 7 byte
          challengePostfix2 = challengeHash.slice(14, 60); // 23 byte

          challengeSignature = challengeHash.slice(60, 188).toUpperCase(); // 64 byte
        } else {
          challengeSignature = challengeHash.slice(0, 128);
        }

        logger.info('Challenge data', {
          challengeHash,
          challengeSignature,
          challengePostfix1,
          challengePostfix2
        });

        let verified: boolean;
        if (mockAuth) {
          verified = true;
        } else {
          verified = await verifyChallengeSignature(
            serial,
            challengeSignature,
            challenge,
            firmwareVersion,
            inTestApp,
            challengePostfix1,
            challengePostfix2
          );
        }

        if (verified) {
          await sendData(connection, 83, '03', packetVersion);
        } else {
          await sendData(connection, 83, '04', packetVersion);
        }

        this.emit('verified', verified);
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      this.emit('error', e);
      flowInterupted = true;
    } finally {
      await this.onEnd(connection, packetVersion, {
        dontAbort: !flowInterupted
      });
    }
  }
}
