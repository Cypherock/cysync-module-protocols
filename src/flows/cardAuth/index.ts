import {
  receiveAnyCommand,
  receiveCommand,
  sendData
} from '@cypherock/communication';

import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions } from '../index';

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
    packetVersion,
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
        await sendData(connection, 70, cardNumber, packetVersion);

        const acceptedRequest: any = await receiveCommand(
          connection,
          70,
          packetVersion,
          30000
        );
        if (acceptedRequest === '00') {
          this.emit('acceptedRequest', false);
          return;
        } else {
          this.emit('acceptedRequest', true);
        }

        const receivedHash: any = await receiveAnyCommand(
          connection,
          [13, 70],
          packetVersion,
          30000
        );

        if (
          receivedHash.commandType === 70 &&
          receivedHash.data.startsWith('00')
        ) {
          this.emit('cardError');
          return;
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
          await sendData(connection, 42, '00', packetVersion);
          return;
        }

        await sendData(connection, 16, challenge, packetVersion);

        const challengeHash: any = await receiveAnyCommand(
          connection,
          [17, 70],
          packetVersion,
          15000
        );

        if (challengeHash.commandType === 70) {
          this.emit('cardError');
          return;
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
          await sendData(connection, 42, '01', packetVersion);
        } else {
          await sendData(connection, 42, '00', packetVersion);
        }

        if (isTestApp) {
          const pairing: any = await receiveCommand(
            connection,
            70,
            packetVersion,
            15000
          );
          if (!pairing.startsWith('01')) {
            this.emit('pairingFailed');
            return;
          }
        }
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
