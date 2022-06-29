import { COINS, EthCoinData, NearCoinData } from '@cypherock/communication';
import { AddressDB } from '@cypherock/database';
import newWallet from '@cypherock/wallet';

import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

export interface TransactionReceiverRunOptions extends CyFlowRunOptions {
  addressDB: AddressDB;
  walletId: string;
  coinType: string;
  xpub: string;
  zpub?: string;
  contractAbbr?: string;
  passphraseExists?: boolean;
  customAccount?: string;
}

export class TransactionReceiver extends CyFlow {
  constructor() {
    super();
  }

  async run({
    connection,
    addressDB,
    walletId,
    coinType,
    xpub,
    zpub,
    contractAbbr = 'ETH',
    passphraseExists = false,
    customAccount
  }: TransactionReceiverRunOptions) {
    let flowInterupted = false;
    try {
      this.cancelled = false;
      let receiveAddress = '';
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
          zpub,
          addressDB
        });
        receiveAddress = wallet.newReceiveAddress().toUpperCase();
        //To make the first x in lowercase
        receiveAddress = '0x' + receiveAddress.slice(2);
        receiveAddressPath = await wallet.getDerivationPath(contractAbbr);
      } else if (coin instanceof NearCoinData && customAccount) {
        wallet = newWallet({
          coinType,
          xpub,
          walletId,
          zpub,
          addressDB
        });
        receiveAddress = customAccount;
        receiveAddressPath = await wallet.getDerivationPathForCustomAccount();
      } else {
        wallet = newWallet({
          coinType,
          xpub,
          walletId,
          zpub,
          addressDB
        });
        receiveAddress = await wallet.newReceiveAddress();
        receiveAddressPath = await wallet.getDerivationPath(receiveAddress);
      }

      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        logger.info('Receive addr data', {
          coin: coinType,
          receiveAddress,
          receiveAddressPath,
          walletId
        });

        await connection.sendData(59, walletId + receiveAddressPath);

        this.emit('derivationPathSent');
        const data = await connection.receiveData([63, 65, 75, 76], 30000);
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
        if (data.commandType === 63 && data.data === '00') {
          this.emit('coinsConfirmed', false);
          throw new ExitFlowError();
        }

        if (data.commandType === 65 && data.data === '01') {
          this.emit('coinsConfirmed', true);
        } else if (data.commandType === 65 && data.data === '00') {
          this.emit('noXpub');
          throw new ExitFlowError();
        } else {
          throw new Error('Invalid data received');
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

        const pinData = await connection.receiveData([79, 47, 81, 71], 90000);

        if (pinData.commandType === 79) {
          this.emit('coinsConfirmed', false);
          throw new ExitFlowError();
        }
        if (pinData.commandType === 81) {
          this.emit('noWalletOnCard');
          throw new ExitFlowError();
        }
        if (pinData.commandType === 71) {
          this.emit('cardError');
          throw new ExitFlowError();
        }

        // Pin entered or card tapped in case of no pin.
        const pinEntered = pinData.data;
        if (pinEntered === '01') {
          this.emit('pinEntered', true);
        } else {
          this.emit('pinEntered', false);
          throw new ExitFlowError();
        }

        this.emit('receiveAddress', receiveAddress);
        const addressesVerified = await connection.receiveData([64], 60000);
        if (addressesVerified.data.startsWith('01')) {
          const addressHex = addressesVerified.data.slice(2);
          let address = '';

          if (coin instanceof EthCoinData) {
            address = `0x${addressHex.toLowerCase()}`;
          } else if (coin instanceof NearCoinData) {
            address = addressHex.toLowerCase();
          } else if (coin instanceof NearCoinData && customAccount) {
            address = customAccount;
          } else {
            address = Buffer.from(addressHex, 'hex').toString().toLowerCase();
          }

          this.emit('addressVerified', address);
        } else if (addressesVerified.data === '00') {
          this.emit('addressVerified', false);
          throw new ExitFlowError();
        } else {
          throw new Error('Invalid command');
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
