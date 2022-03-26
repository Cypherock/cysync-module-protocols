import {
  COINS,
  receiveAnyCommand,
  receiveCommand,
  sendData
} from '@cypherock/communication';
import { AddressDB } from '@cypherock/database';
import newWallet from '@cypherock/wallet';

import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions } from '../index';

export interface TransactionReceiverRunOptions extends CyFlowRunOptions {
  addressDB: AddressDB;
  walletId: string;
  coinType: string;
  xpub: string;
  zpub?: string;
  contractAbbr?: string;
  passphraseExists?: boolean;
}

export class TransactionReceiver extends CyFlow {
  constructor() {
    super();
  }

  async run({
    connection,
    packetVersion,
    addressDB,
    walletId,
    coinType,
    xpub,
    zpub,
    contractAbbr = 'ETH',
    passphraseExists = false
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

      if (coin.isEth) {
        wallet = newWallet({ coinType, xpub, zpub, addressDB });
        receiveAddress = wallet.newReceiveAddress().toUpperCase();
        //To make the first x in lowercase
        receiveAddress = '0x' + receiveAddress.slice(2);
        receiveAddressPath = await wallet.getDerivationPath(contractAbbr);
      } else {
        wallet = newWallet({ coinType, xpub, zpub, addressDB });
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

        await sendData(
          connection,
          59,
          walletId + receiveAddressPath,
          packetVersion
        );

        this.emit('derivationPathSent');
        const data: any = await receiveAnyCommand(
          connection,
          [63, 65, 75, 76],
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
        if (data.commandType === 63 && data.data === '00') {
          this.emit('coinsConfirmed', false);
          return;
        }

        if (data.commandType === 65 && data.data === '01') {
          this.emit('coinsConfirmed', true);
        } else if (data.commandType === 65 && data.data === '00') {
          this.emit('noXpub');
          return;
        } else {
          throw new Error('Invalid data received');
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

        const pinData: any = await receiveAnyCommand(
          connection,
          [79, 47, 81, 71],
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
        if (pinData.commandType === 71) {
          this.emit('cardError');
          return;
        }

        // Pin entered or card tapped in case of no pin.
        const pinEntered = pinData.data;
        if (pinEntered === '01') {
          this.emit('pinEntered', true);
        } else {
          this.emit('pinEntered', false);
          return;
        }

        this.emit('receiveAddress', receiveAddress);
        const addressesVerified: any = await receiveCommand(
          connection,
          64,
          packetVersion,
          60000
        );
        if (addressesVerified.startsWith('01')) {
          const addressHex = addressesVerified.slice(2);
          let address = '';

          if (coin.isEth) {
            address = `0x${addressHex.toLowerCase()}`;
          } else {
            address = Buffer.from(addressHex, 'hex').toString().toLowerCase();
          }

          this.emit('addressVerified', address);
        } else if (addressesVerified === '00') {
          this.emit('addressVerified', false);
          return;
        } else {
          this.emit('internalError');
          return;
        }

        await sendData(connection, 42, '01', packetVersion);
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      this.emit('error', e);
      flowInterupted = true;
    } finally {
      await this.onEnd(connection, packetVersion, {
        dontAbort: !flowInterupted
      });
    }
  }
}
