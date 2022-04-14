import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

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
        await connection.sendData(
          45,
          walletId + resyncIndex + createCoinIndexes(selectedCoins)
        );

        const data = await connection.receiveData([46, 75, 76], 30000);
        if (data.commandType === 75) {
          this.emit('locked');
          throw new ExitFlowError();
        }
        if (data.commandType === 76) {
          if (data.data.startsWith('02')) {
            // Wallet does not exist
            this.emit('noWalletFound', false);
          } else {
            // Wallet is in partial state
            this.emit('noWalletFound', true);
          }
          throw new ExitFlowError();
        }
        const coinConfirmed = data.data;
        if (parseInt(coinConfirmed, 10)) {
          this.emit('coinsConfirmed', true);
        } else {
          this.emit('coinsConfirmed', false);
          throw new ExitFlowError();
        }

        if (passphraseExists) {
          const passphraseData = await connection.receiveData([91, 90], 90000);

          if (passphraseData.commandType === 91) {
            this.emit('coinsConfirmed', false);
            throw new ExitFlowError();
          }

          if (!passphraseData.data.startsWith('01')) {
            throw new Error('Invalid data from device.');
          }

          this.emit('passphraseEntered');
        }

        if (pinExists) {
          const pinData = await connection.receiveData([47, 79, 81], 90000);
          if (pinData.commandType === 79) {
            this.emit('coinsConfirmed', false);
            throw new ExitFlowError();
          }

          if (pinData.commandType === 81) {
            this.emit('noWalletOnCard');
            throw new ExitFlowError();
          }

          const pinEntered = pinData.data;
          if (parseInt(pinEntered, 10)) {
            this.emit('pinEntered', true);
          } else {
            this.emit('pinEntered', false);
            throw new ExitFlowError();
          }
        }

        const data1 = await connection.receiveData([48, 79, 81, 71], 45000);
        if (data1.commandType === 79) {
          this.emit('coinsConfirmed', false);
          throw new ExitFlowError();
        }
        if (data1.commandType === 81) {
          this.emit('noWalletOnCard');
          throw new ExitFlowError();
        }
        if (data1.commandType === 71) {
          this.emit('cardError');
          throw new ExitFlowError();
        }

        this.emit('cardTapped');

        const xPubDetails = await connection.receiveData([49], 60000);
        if (!xPubDetails) {
          //I don't remember why I had put this condition.
          this.emit('unknownError');
          flowInterupted = true;
          throw new ExitFlowError();
        }

        await connection.sendData(42, '01');
        if (!isResync) {
          const xpubList = await formatCoinsForDB(
            walletId,
            xPubDetails.data,
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
