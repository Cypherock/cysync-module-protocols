import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

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
        await connection.sendData(83, '01');
        const data = await connection.receiveData([85, 83], 30000);

        if (data.commandType === 83) {
          this.emit('confirmed', false);
          throw new ExitFlowError();
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
          await connection.sendData(83, '04');
          throw new ExitFlowError();
        }

        await connection.sendData(83, '02' + challenge);

        const challengeHash = await connection.receiveData([86], 10000);

        let challengeSignature: string;
        let challengePostfix1: string | undefined;
        let challengePostfix2: string | undefined;

        if (challengeHash.data.length > 128) {
          challengePostfix1 = challengeHash.data.slice(0, 14); // 7 byte
          challengePostfix2 = challengeHash.data.slice(14, 60); // 23 byte

          challengeSignature = challengeHash.data.slice(60, 188).toUpperCase(); // 64 byte
        } else {
          challengeSignature = challengeHash.data.slice(0, 128);
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
          await connection.sendData(83, '03');
        } else {
          await connection.sendData(83, '04');
        }

        this.emit('verified', verified);
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      if (!(e instanceof ExitFlowError)) {
        flowInterupted = true;
        this.emit('error', e);
      }
    } finally {
      await this.onEnd(connection, {
        dontAbort: !flowInterupted
      });
    }
  }
}
