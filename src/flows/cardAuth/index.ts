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

export class CardAuthenticator extends CyFlow {
  constructor() {
    super();
  }

  async run({
    connection,
    firmwareVersion,
    cardNumber = '00',
    isTestApp = false
  }: CardAuthenticatorRunOptions) {
    this.cancelled = false;
    let flowInterupted = false;

    try {
      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        await connection.sendData(70, cardNumber);

        const acceptedRequest = await connection.receiveData([70], 30000);
        if (acceptedRequest.data === '00') {
          this.emit('acceptedRequest', false);
          throw new ExitFlowError();
        } else {
          this.emit('acceptedRequest', true);
        }

        const receivedHash = await connection.receiveData([13, 70], 90000);

        if (
          receivedHash.commandType === 70 &&
          receivedHash.data.startsWith('00')
        ) {
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
