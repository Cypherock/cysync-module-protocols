import { commandHandler76 } from '../../handlers';
import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

import { extractWalletDetails } from './helper';

export interface WalletAdderRunOptions extends CyFlowRunOptions {}

enum WALLET_ADDER_TASKS {
  WALLET_ADDER_SELECT_WALLET = 1,
  WALLET_ADDER_WAITING_SCREEN,
  WALLET_ADDER_FINAL_SCREEN
}

/**
 * Class to add a new wallet to the desktop app from the hardware wallet.
 *
 * @extends CyFlow
 */
export class WalletAdder extends CyFlow {
  /**
   * calls the super class and sets the cancelled to false as default.
   */
  constructor() {
    super();
  }

  private async runOperation({ connection }: WalletAdderRunOptions) {
    const sequenceNumber = connection.getNewSequenceNumber();

    await connection.sendCommand({
      commandType: 43,
      data: '00',
      sequenceNumber
    });

    let requestAcceptedState = 0;

    const data = await connection.waitForCommandOutput({
      expectedCommandTypes: [44, 76],
      sequenceNumber,
      onStatus: status => {
        if (
          status.flowStatus >= WALLET_ADDER_TASKS.WALLET_ADDER_SELECT_WALLET &&
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

    if (data.commandType === 76) {
      commandHandler76(data, this);
    }

    const rawWalletDetails = data.data;
    if (rawWalletDetails === '00') {
      this.emit('walletDetails', null);
      throw new ExitFlowError();
    }

    const walletDetails = extractWalletDetails(rawWalletDetails);
    logger.info('Wallet Details', { walletDetails });
    this.emit('walletDetails', walletDetails);
  }

  /**
   * this function runs the complete add wallet flow. the diagram can be found in the repo at src/flows/addWallet/add_wallet.uml
   * @param connection - the serialport connection instance.
   */
  async run(params: WalletAdderRunOptions) {
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
