import { PacketVersionMap, CmdState } from '@cypherock/communication';
import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

import { verifyChallengeSignature, verifySerialSignature } from './helper';

export interface DeviceAuthenticatorRunOptions extends CyFlowRunOptions {
  firmwareVersion: string;
  mockAuth?: boolean;
  inTestApp: boolean;
}

enum VERIFY_DEVICE_FLOW {
  VERIFY_DEVICE_START_MESSAGE = 1,
  VERIFY_DEVICE_ESTABLISH_CONNECTION_FRONTEND,
  VERIFY_DEVICE_ESTABLISH_CONNECTION_BACKEND,
  VERIFY_DEVICE_FETCH_RANDOM_NUMBER,
  VERIFY_DEVICE_SIGN_RANDOM_NUMBER_FRONTEND,
  VERIFY_DEVICE_SIGN_RANDOM_NUMBER_BACKEND,
  VERIFY_DEVICE_FINAL_MESSAGE,
  VERIFY_DEVICE_SUCCESS,
  VERIFY_DEVICE_FAILED
}

export class DeviceAuthenticator extends CyFlow {
  constructor() {
    super();
  }

  async runLegacy({
    connection,
    mockAuth,
    firmwareVersion,
    inTestApp
  }: DeviceAuthenticatorRunOptions) {
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
  }

  async runOperation({
    connection,
    mockAuth,
    firmwareVersion,
    inTestApp
  }: DeviceAuthenticatorRunOptions) {
    let sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 83,
      data: '01',
      sequenceNumber
    });

    let requestAcceptedState = 0;

    let data = await connection.waitForCommandOutput({
      sequenceNumber,
      executingCommandTypes: [83],
      expectedCommandTypes: [85, 83],
      onStatus: status => {
        if (status.cmdState === CmdState.CMD_STATUS_REJECTED) {
          this.emit('confirmed', false);
          throw new ExitFlowError();
        }

        if (status.cmdState !== CmdState.CMD_STATUS_EXECUTING) {
          return;
        }

        if (
          status.cmdStatus >=
            VERIFY_DEVICE_FLOW.VERIFY_DEVICE_ESTABLISH_CONNECTION_BACKEND &&
          requestAcceptedState === 0
        ) {
          requestAcceptedState = 1;
        }

        if (requestAcceptedState === 1) {
          requestAcceptedState = 2;
          this.emit('confirmed', true);
        }
      }
    });

    if (data.commandType === 83) {
      this.emit('confirmed', false);
      throw new ExitFlowError();
    }

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

    sequenceNumber = connection.getNewSequenceNumber();
    if (!challenge) {
      this.emit('verified', false);
      await connection.sendCommand({
        commandType: 83,
        data: '04',
        sequenceNumber
      });
      throw new ExitFlowError();
    }

    await connection.sendCommand({
      commandType: 83,
      data: '02' + challenge,
      sequenceNumber
    });

    const challengeHash = await connection.waitForCommandOutput({
      sequenceNumber,
      executingCommandTypes: [83],
      expectedCommandTypes: [86],
      onStatus: () => {}
    });

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

    sequenceNumber = connection.getNewSequenceNumber();
    if (verified) {
      await connection.sendCommand({
        commandType: 83,
        data: '03',
        sequenceNumber
      });
    } else {
      await connection.sendCommand({
        commandType: 83,
        data: '04',
        sequenceNumber
      });
    }

    this.emit('verified', verified);
  }

  async run(params: DeviceAuthenticatorRunOptions) {
    const { connection } = params;
    this.cancelled = false;
    let flowInterupted = false;

    try {
      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        const packetVersion = connection.getPacketVersion();
        if (packetVersion === PacketVersionMap.v3) {
          await this.runOperation(params);
        } else {
          await this.runLegacy(params);
        }
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
