import { PacketVersionMap, CmdState } from '@cypherock/communication';
import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

import {
  sha256,
  verifyChallengeSignature,
  verifySerialSignature
} from './helper';

export interface CardAuthenticatorRunOptions extends CyFlowRunOptions {
  firmwareVersion: string;
  cardNumber?: string;
  isTestApp?: boolean;
}

enum VERIFY_CARD_FLOW {
  VERIFY_CARD_START_MESSAGE = 1,
  VERIFY_CARD_ESTABLISH_CONNECTION_FRONTEND,
  VERIFY_CARD_ESTABLISH_CONNECTION_BACKEND,
  VERIFY_CARD_FETCH_RANDOM_NUMBER,
  VERIFY_CARD_SIGN_RANDOM_NUMBER_FRONTEND,
  VERIFY_CARD_SIGN_RANDOM_NUMBER_BACKEND,
  VERIFY_CARD_FINAL_MESSAGE,
  VERIFY_CARD_SUCCESS,
  VERIFY_CARD_FAILED
}

export class CardAuthenticator extends CyFlow {
  constructor() {
    super();
  }

  async runLegacy({
    connection,
    firmwareVersion,
    cardNumber = '00',
    isTestApp = false
  }: CardAuthenticatorRunOptions) {
    await connection.sendData(70, cardNumber);

    const acceptedRequest = await connection.receiveData([70], 30000);
    if (acceptedRequest.data === '00') {
      this.emit('acceptedRequest', false);
      throw new ExitFlowError();
    } else {
      this.emit('acceptedRequest', true);
    }

    const receivedHash = await connection.receiveData([13, 70], 90000);

    if (receivedHash.commandType === 70 && receivedHash.data.startsWith('00')) {
      this.emit('cardError');
      throw new ExitFlowError();
    } else if (receivedHash.commandType !== 13) {
      throw new Error('Invalid command received');
    }

    const serial = receivedHash.data.slice(128).toUpperCase();
    const serialSignature = receivedHash.data.slice(0, 128);
    this.emit('serialSigned', true);

    logger.info('Serial number and signature', {
      serial,
      serialSignature
    });

    const challenge = await verifySerialSignature(
      serial,
      serialSignature,
      sha256(serial)
    );

    if (!challenge) {
      this.emit('verified', false);
      await connection.sendData(42, '00');
      throw new ExitFlowError();
    }

    await connection.sendData(16, challenge);

    const challengeHash = await connection.receiveData([17, 70], 90000);

    if (challengeHash.commandType === 70) {
      this.emit('cardError');
      throw new ExitFlowError();
    } else if (challengeHash.commandType !== 17) {
      throw new Error('Invalid command received');
    }

    this.emit('challengeSigned', true);

    const challengeSignature = challengeHash.data.slice(0, 128);
    logger.info('Challenge data', {
      challengeSignature,
      challengeHash: challengeHash.data
    });

    const verified = await verifyChallengeSignature(
      serial,
      challengeSignature,
      challenge,
      firmwareVersion
    );
    this.emit('verified', verified);

    if (verified) {
      await connection.sendData(42, '01');
    } else {
      await connection.sendData(42, '00');
    }

    if (isTestApp) {
      const pairing = await connection.receiveData([70], 90000);
      if (!pairing.data.startsWith('01')) {
        this.emit('pairingFailed');
        throw new ExitFlowError();
      }
    }
  }

  async runOperation({
    connection,
    firmwareVersion,
    cardNumber = '00',
    isTestApp = false
  }: CardAuthenticatorRunOptions) {
    let sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 70,
      data: cardNumber,
      sequenceNumber
    });

    let requestAcceptedState = 0;

    const cardData = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [70, 13],
      onStatus: status => {
        if (status.cmdState === CmdState.CMD_STATUS_REJECTED) {
          this.emit('acceptedRequest', false);
          throw new ExitFlowError();
        }

        if (
          status.cmdStatus >=
            VERIFY_CARD_FLOW.VERIFY_CARD_ESTABLISH_CONNECTION_BACKEND &&
          requestAcceptedState === 0
        ) {
          requestAcceptedState = 1;
        }

        if (requestAcceptedState === 1) {
          requestAcceptedState = 2;
          this.emit('acceptedRequest', true);
        }
      }
    });

    if (cardData.commandType === 70 && cardData.data.startsWith('00')) {
      this.emit('cardError');
      throw new ExitFlowError();
    }

    const serial = cardData.data.slice(128).toUpperCase();
    const serialSignature = cardData.data.slice(0, 128);
    this.emit('serialSigned', true);

    logger.info('Serial number and signature', {
      serial,
      serialSignature
    });

    const challenge = await verifySerialSignature(
      serial,
      serialSignature,
      sha256(serial)
    );

    sequenceNumber = connection.getNewSequenceNumber();

    if (!challenge) {
      this.emit('verified', false);
      await connection.sendCommand({
        commandType: 42,
        data: '00',
        sequenceNumber
      });
      throw new ExitFlowError();
    }

    await connection.sendCommand({
      commandType: 16,
      data: challenge,
      sequenceNumber
    });

    const challengeHash = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [70, 17],
      onStatus: () => {}
    });

    if (challengeHash.commandType === 70) {
      this.emit('cardError');
      throw new ExitFlowError();
    }

    this.emit('challengeSigned', true);

    const challengeSignature = challengeHash.data.slice(0, 128);
    logger.info('Challenge data', {
      challengeSignature,
      challengeHash: challengeHash.data
    });

    const verified = await verifyChallengeSignature(
      serial,
      challengeSignature,
      challenge,
      firmwareVersion
    );
    this.emit('verified', verified);

    sequenceNumber = connection.getNewSequenceNumber();
    if (verified) {
      await connection.sendCommand({
        commandType: 42,
        data: '01',
        sequenceNumber
      });
    } else {
      await connection.sendCommand({
        commandType: 42,
        data: '00',
        sequenceNumber
      });
    }

    if (isTestApp) {
      const pairing = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [70],
        onStatus: () => {}
      });

      if (pairing.commandType !== 70) {
        throw new Error('Invalid command type');
      }

      if (!pairing.data.startsWith('01')) {
        this.emit('pairingFailed');
        throw new ExitFlowError();
      }
    }
  }

  async run(params: CardAuthenticatorRunOptions) {
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
