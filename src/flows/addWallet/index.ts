import { PacketVersionMap, CmdState } from '@cypherock/communication';
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

  private async runLegacy({ connection }: WalletAdderRunOptions) {
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
  }

  private async runOperation({ connection }: WalletAdderRunOptions) {
    let sequenceNumber = connection.getNewSequenceNumber();

    await connection.sendCommand({
      commandType: 43,
      data: '00',
      sequenceNumber
    });

    let requestAcceptedState = 0;

    let data = await connection.waitForCommandOutput({
      executingCommandTypes: [43],
      expectedCommandTypes: [44, 76],
      sequenceNumber,
      onStatus: status => {
        if (status.cmdState === CmdState.CMD_STATUS_REJECTED) {
          this.emit('acceptedRequest', false);
          throw new ExitFlowError();
        }

        if (
          status.cmdStatus >= WALLET_ADDER_TASKS.WALLET_ADDER_SELECT_WALLET &&
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
