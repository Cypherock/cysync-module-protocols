import { commandHandler76 } from '../../handlers';
import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

import { createCoinIndex, formatCoinsForDB } from './helper';

export interface CoinAdderRunOptions extends CyFlowRunOptions {
  walletId: string;
  selectedCoin: {
    accountIndex: number;
    accountType: string;
    id: string;
  };
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

  async runOperation({
    connection,
    sdkVersion,
    walletId,
    selectedCoin,
    pinExists,
    passphraseExists
  }: CoinAdderRunOptions) {
    const sequenceNumber = connection.getNewSequenceNumber();
    const addCoinData =
      walletId + '00' + createCoinIndex(sdkVersion, selectedCoin);
    await connection.sendCommand({
      commandType: 45,
      data: addCoinData,
      sequenceNumber
    });

    let requestAcceptedState = 0;
    let passphraseEnteredState = 0;
    let pinEnteredState = 0;
    let cardTapState = 0;

    const data = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [46, 49, 75, 76, 71, 81, 79, 91],
      onStatus: status => {
        if (
          status.flowStatus > ADD_COINS_TASKS.ADD_COINS_VERIFY &&
          requestAcceptedState === 0
        ) {
          requestAcceptedState = 1;
        }

        if (
          passphraseExists &&
          status.flowStatus > ADD_COINS_TASKS.ADD_COINS_CONFIRM_PASSPHRASE &&
          passphraseEnteredState === 0
        ) {
          passphraseEnteredState = 1;
        }

        if (
          pinExists &&
          status.flowStatus >= ADD_COINS_TASKS.ADD_COINS_TAP_CARD_SEND_CMD &&
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
      commandHandler76(data, this);
    }

    if ([79, 91, 46].includes(data.commandType)) {
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

    const xpubList = await formatCoinsForDB(
      walletId,
      data.data,
      selectedCoin.id
    );
    logger.debug('Xpub list', { xpubList });
    this.emit('xpubList', xpubList);
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
        await this.runOperation(params);
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
