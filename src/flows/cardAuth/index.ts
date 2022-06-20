import {
  PacketVersionMap,
  RawData,
  StatusData,
  CmdState
} from '@cypherock/communication';
import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

import {
  sha256,
  verifyChallengeSignature,
  verifySerialSignature
} from './helper';

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface CardAuthenticatorRunOptions extends CyFlowRunOptions {
  firmwareVersion: string;
  cardNumber?: string;
  isTestApp?: boolean;
}

enum VERIFY_MAIN_CARD_FLOW {
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
        const packetVersion = connection.getPacketVersion();
        console.log({ packetVersion });
        if (packetVersion === PacketVersionMap.v3) {
          let sequenceNumber = connection.getNewSequenceNumber();
          await connection.sendCommand({
            commandType: 70,
            data: cardNumber,
            sequenceNumber
          });

          let cardData: RawData | undefined;
          let isDone = false;
          let requestAcceptedState = 0;

          while (!isDone) {
            const response = await connection.getCommandOutput(sequenceNumber);
            if (response.isRawData) {
              isDone = true;
              cardData = response as RawData;
              break;
            }

            const status = response as StatusData;
            if (status.currentCmdSeq === sequenceNumber) {
              if (status.cmdState === CmdState.CMD_STATUS_REJECTED) {
                this.emit('acceptedRequest', false);
                throw new ExitFlowError();
              }

              if (
                status.cmdStatus >=
                  VERIFY_MAIN_CARD_FLOW.VERIFY_CARD_ESTABLISH_CONNECTION_BACKEND &&
                requestAcceptedState === 0
              ) {
                requestAcceptedState = 1;
              }

              if (requestAcceptedState === 1) {
                requestAcceptedState = 2;
                this.emit('acceptedRequest', true);
              }
            }

            await sleep(200);
          }

          if (!cardData) {
            throw new Error('Connot get card data');
          }

          if (cardData.commandType === 70 && cardData.data.startsWith('00')) {
            this.emit('cardError');
            throw new ExitFlowError();
          } else if (cardData.commandType !== 13) {
            throw new Error('Invalid command received');
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

          console.log({ challenge });

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

          let challengeHash: RawData | undefined;
          isDone = false;

          while (!isDone) {
            const response = await connection.getCommandOutput(sequenceNumber);
            if (response.isRawData) {
              isDone = true;
              challengeHash = response as RawData;
              break;
            }

            const status = response as StatusData;
            if (status.currentCmdSeq === sequenceNumber) {
            }

            await sleep(200);
          }
          // const challengeHash = await connection.receiveData([17, 70], 90000);
          //
          if (!challengeHash) {
            throw new Error('Challenge hash is not defined');
          }

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

          // if (isTestApp) {
          //   const pairing = await connection.receiveData([70], 90000);
          //   if (!pairing.data.startsWith('01')) {
          //     this.emit('pairingFailed');
          //     throw new ExitFlowError();
          //   }
          // }
        } else {
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
