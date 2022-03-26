import {
  receiveAnyCommand,
  receiveCommand,
  sendData
} from '@cypherock/communication';

import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions } from '../index';

import { createCoinIndexes, formatCoinsForDB } from './helper';

export interface CoinAdderRunOptions extends CyFlowRunOptions {
  walletId: string;
  selectedCoins: string[];
  isResync: boolean;
  pinExists: boolean;
  passphraseExists: boolean;
}

/**
 * Class to add a new coin to the hardware wallet and the desktop app.
 *
 * @extends CyFlow
 */
export class CoinAdder extends CyFlow {
  /**
   * calls the super class and sets the cancelled to false as default.
   */
  constructor() {
    super();
  }

  /**
   * this function runs the complete add coin flow. the diagram can be found in the repo at src/flows/addCoin/add_coin.uml
   */
  async run({
    connection,
    packetVersion,
    walletId,
    selectedCoins,
    isResync,
    pinExists,
    passphraseExists
  }: CoinAdderRunOptions) {
    this.cancelled = false;
    let flowInterupted = false;

    try {
      await this.onStart(connection);

      const ready = await this.deviceReady(connection);
      const resyncIndex = isResync ? '01' : '00';

      if (ready) {
        await sendData(
          connection,
          45,
          walletId + resyncIndex + createCoinIndexes(selectedCoins),
          packetVersion
        );

        const data: any = await receiveAnyCommand(
          connection,
          [46, 75, 76],
          packetVersion,
          30000
        );
        if (data.commandType === 75) {
          this.emit('locked');
          return;
        }
        if (data.commandType === 76) {
          if (data.data.startsWith('02')) {
            // Wallet does not exist
            this.emit('noWalletFound', false);
          } else {
            // Wallet is in partial state
            this.emit('noWalletFound', true);
          }
          return;
        }
        const coinConfirmed: any = data.data;
        if (parseInt(coinConfirmed, 10)) {
          this.emit('coinsConfirmed', true);
        } else {
          this.emit('coinsConfirmed', false);
          return;
        }

        if (passphraseExists) {
          const passphraseData: any = await receiveAnyCommand(
            connection,
            [91, 90],
            packetVersion,
            90000
          );

          if (passphraseData.commandType === 91) {
            this.emit('coinsConfirmed', false);
            return;
          }

          if (!passphraseData.data.startsWith('01')) {
            throw new Error('Invalid data from device.');
          }

          this.emit('passphraseEntered');
        }

        if (pinExists) {
          const pinData: any = await receiveAnyCommand(
            connection,
            [47, 79, 81],
            packetVersion,
            90000
          );
          if (pinData.commandType === 79) {
            this.emit('coinsConfirmed', false);
            return;
          }

          if (pinData.commandType === 81) {
            this.emit('noWalletOnCard');
            return;
          }

          const pinEntered = pinData.data;
          if (parseInt(pinEntered, 10)) {
            this.emit('pinEntered', true);
          } else {
            this.emit('pinEntered', false);
            return;
          }
        }

        const data1: any = await receiveAnyCommand(
          connection,
          [48, 79, 81, 71],
          packetVersion,
          45000
        );
        if (data1.commandType === 79) {
          this.emit('coinsConfirmed', false);
          return;
        }
        if (data1.commandType === 81) {
          this.emit('noWalletOnCard');
          return;
        }
        if (data1.commandType === 71) {
          this.emit('cardError');
          return;
        }

        this.emit('cardTapped');

        const xPubDetails: any = await receiveCommand(
          connection,
          49,
          packetVersion,
          60000
        );
        if (!xPubDetails) {
          //I don't remember why I had put this condition.
          this.emit('unknownError');
          flowInterupted = true;
          return;
        }

        await sendData(connection, 42, '01', packetVersion);
        if (!isResync) {
          const xpubList = await formatCoinsForDB(
            walletId,
            xPubDetails,
            selectedCoins
          );
          logger.debug('Xpub list', { xpubList });
          this.emit('xpubList', xpubList);
        } else {
          this.emit('xpubList', []);
        }
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      flowInterupted = true;
      this.emit('error', e);
    } finally {
      await this.onEnd(connection, packetVersion, {
        dontAbort: !flowInterupted
      });
    }
  }
}
