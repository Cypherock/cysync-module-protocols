import { COINS, EthCoinData } from '@cypherock/communication';
import newWallet from '@cypherock/wallet';

import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

export interface CoinSpecificDataRunOptions extends CyFlowRunOptions {
  walletId: string;
  coinType: string;
  xpub: string;
  zpub?: string;
  contractAbbr?: string;
  addData: string;
  removeData: string | undefined;
}

export class CoinSpecificData extends CyFlow {
  receiveData: string;

  constructor() {
    super();
    this.receiveData = '';
  }

  public setReceiveData(data: string) {
    this.receiveData = data;
  }

  async run({
    connection,
    walletId,
    coinType,
    xpub,
    zpub,
    contractAbbr = 'ETH',
    addData,
    removeData
  }: CoinSpecificDataRunOptions) {
    let flowInterupted = false;
    try {
      this.cancelled = false;
      let receiveAddressPath = '';
      let wallet: any;

      const coin = COINS[coinType];

      if (!coin) {
        throw new Error(`Invalid coinType ${coinType}`);
      }

      if (coin instanceof EthCoinData) {
        wallet = newWallet({
          coinType,
          xpub,
          walletId,
          zpub
        });
        receiveAddressPath = await wallet.getDerivationPath(contractAbbr);
      } else {
        wallet = newWallet({
          coinType,
          xpub,
          walletId,
          zpub
        });
        let receiveAddress = await wallet.newReceiveAddress();
        receiveAddressPath = await wallet.getDerivationPath(receiveAddress);
      }

      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        logger.info('Coin specific data metadata', {
          coin: coinType,
          receiveAddressPath,
          walletId
        });

        await connection.sendData(92, walletId + receiveAddressPath);

        this.emit('derivationPathSent');
        const data = await connection.receiveData([93, 75, 76], 30000);
        if (data.commandType === 75) {
          this.emit('locked');
          throw new ExitFlowError();
        } else if (data.commandType === 76) {
          if (data.data.startsWith('02')) {
            // Wallet does not exist
            this.emit('noWalletFound', false);
          } else {
            // Wallet is in partial state
            this.emit('noWalletFound', true);
          }
          throw new ExitFlowError();
        } else if (data.commandType === 93) {
          if (data.data.startsWith('00')) {
            this.emit('coinsConfirmed', false);
            throw new ExitFlowError();
          } else if (data.data.startsWith('01')) {
            const length = data.data.slice(2, 6);
            const coinData = length !== '0000' ? data.data.slice(6) : true;
            this.emit('coinsConfirmed', coinData);
          }
        } else {
          throw new Error('Invalid data received');
        }

        const addNumLength = addData.length + 1;
        const addLength = addNumLength.toString(16).padStart(4, '0');

        let removeDataHex = '0000';
        if (removeData) {
          const removeDataLength = removeData.length + 1;
          const removeLength = removeDataLength.toString(16).padStart(4, '0');
          removeDataHex =
            removeLength.slice(2, 4) +
            removeLength.slice(0, 2) +
            Buffer.from(removeData)
              .toString('hex')
              .padEnd(removeDataLength + (removeDataLength % 2), '0');
        }

        await connection.sendData(
          94,
          removeDataHex +
            addLength.slice(2, 4) +
            addLength.slice(0, 2) +
            Buffer.from(addData)
              .toString('hex')
              .padEnd(addNumLength + (addNumLength % 2), '0')
        );
        this.emit('addDataSent');

        const confimation = await connection.receiveData([95], 30000);
        if (confimation.data === '01') {
          this.emit('dataSaved', true);
        } else {
          this.emit('dataSaved', false);
        }
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
