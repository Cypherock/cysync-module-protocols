import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

import { extractWalletDetails } from './helper';

export interface WalletAdderRunOptions extends CyFlowRunOptions {}

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

  /**
   * this function runs the complete add wallet flow. the diagram can be found in the repo at src/flows/addWallet/add_wallet.uml
   * @param connection - the serialport connection instance.
   */
  async run({ connection }: WalletAdderRunOptions) {
    this.cancelled = false;
    let flowInterupted = false;

    try {
      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        await connection.sendData(43, '00');

        const data = await connection.receiveData([44, 76], 30000);
        if (data.commandType === 76) {
          if (data.data.startsWith('00')) {
            // No Wallet exist
            this.emit('noWalletFound', false);
          } else {
            // All exisiting wallets are in partial state
            this.emit('noWalletFound', true);
          }
          throw new ExitFlowError();
        }

        const rawWalletDetails = data.data;
        if (rawWalletDetails === '00') {
          this.emit('walletDetails', null);
          throw new ExitFlowError();
        }

        const walletDetails = extractWalletDetails(rawWalletDetails);
        logger.info('Wallet Details', { walletDetails });
        this.emit('walletDetails', walletDetails);

        await connection.sendData(42, '01');
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
