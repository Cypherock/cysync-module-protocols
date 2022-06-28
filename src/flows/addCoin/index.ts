import { PacketVersionMap } from '@cypherock/communication';
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

enum ADD_COINS_TASKS {
  ADD_COINS_VERIFY = 1,
  ADD_COINS_ENTER_PASSPHRASE,
  ADD_COINS_CONFIRM_PASSPHRASE,
  ADD_COINS_CHECK_PIN,
  ADD_COINS_ENTER_PIN,
  ADD_COINS_TAP_CARD,
  ADD_COINS_TAP_CARD_SEND_CMD,
  ADD_COINS_READ_DEVICE_SHARE,
  ADD_COIN_GENERATING_XPUBS,
  ADD_COINS_WAITING_SCREEN,
  ADD_COINS_FINAL_SCREEN
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

  async runLegacy({
    connection,
    walletId,
    selectedCoins,
    isResync,
    pinExists,
    passphraseExists
  }: CoinAdderRunOptions) {
    const resyncIndex = isResync ? '01' : '00';
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

    const data1 = await connection.receiveData([48, 79, 81, 71], 90000);
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
      throw new Error('No xpub details found');
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
  }

  async runOperation({
    connection,
    walletId,
    selectedCoins,
    isResync,
    pinExists,
    passphraseExists
  }: CoinAdderRunOptions) {
    const resyncIndex = isResync ? '01' : '00';
    let sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 45,
      data: walletId + resyncIndex + createCoinIndexes(selectedCoins),
      sequenceNumber
    });

    let requestAcceptedState = 0;
    let passphraseEnteredState = 0;
    let pinEnteredState = 0;
    let cardTapState = 0;

    const data = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [46, 49, 75, 76, 71, 81],
      onStatus: status => {
        if (
          status.flowStatus >= ADD_COINS_TASKS.ADD_COINS_VERIFY &&
          requestAcceptedState === 0
        ) {
          requestAcceptedState = 1;
        }

        if (
          passphraseExists &&
          status.flowStatus >= ADD_COINS_TASKS.ADD_COINS_CONFIRM_PASSPHRASE &&
          passphraseEnteredState === 0
        ) {
          passphraseEnteredState = 1;
        }

        if (
          pinExists &&
          status.flowStatus >= ADD_COINS_TASKS.ADD_COINS_ENTER_PIN &&
          pinEnteredState === 0
        ) {
          pinEnteredState = 1;
        }

        if (
          status.flowStatus >= ADD_COINS_TASKS.ADD_COINS_TAP_CARD_SEND_CMD &&
          cardTapState === 0
        ) {
          cardTapState = 1;
        }

        if (requestAcceptedState === 1) {
          requestAcceptedState = 2;
          this.emit('coinsConfirmed', true);
        }

        if (passphraseEnteredState === 1) {
          passphraseEnteredState = 2;
          this.emit('passphraseEntered');
        }

        if (pinEnteredState === 1) {
          pinEnteredState = 2;
          this.emit('pinEntered', true);
        }

        if (cardTapState === 1) {
          cardTapState = 2;
          this.emit('cardTapped');
        }
      }
    });

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

    if (data.commandType === 46) {
      this.emit('coinsConfirmed', false);
      throw new ExitFlowError();
    }

    if (data.commandType === 81) {
      this.emit('noWalletOnCard');
      throw new ExitFlowError();
    }

    if (data.commandType === 71) {
      this.emit('cardError');
      throw new ExitFlowError();
    }

    if (!isResync) {
      const xpubList = await formatCoinsForDB(
        walletId,
        data.data,
        selectedCoins
      );
      logger.debug('Xpub list', { xpubList });
      this.emit('xpubList', xpubList);
    } else {
      this.emit('xpubList', []);
    }
  }

  /**
   * this function runs the complete add coin flow. the diagram can be found in the repo at src/flows/addCoin/add_coin.uml
   */
  async run(params: CoinAdderRunOptions) {
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
