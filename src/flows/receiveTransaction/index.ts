import {
  CoinGroup,
  COINS,
  EthCoinData,
  PacketVersionMap
} from '@cypherock/communication';
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
  pinExists?: boolean;
}

interface RunParams extends TransactionReceiverRunOptions {
  receiveAddress: string;
  receiveAddressPath: string;
}

enum RECEIVE_TRANSACTION_STATUS {
  RECV_TXN_FIND_XPUB = 1,
  RECV_TXN_ENTER_PASSPHRASE,
  RECV_TXN_CONFIRM_PASSPHRASE,
  RECV_TXN_CHECK_PIN,
  RECV_TXN_ENTER_PIN,
  RECV_TXN_TAP_CARD,
  RECV_TXN_TAP_CARD_SEND_CMD,
  RECV_TXN_READ_DEVICE_SHARE,
  RECV_TXN_DERIVE_ADD_SCREEN,
  RECV_TXN_DERIVE_ADD,
  RECV_TXN_DISPLAY_ADDR,
  RECV_TXN_WAITING_SCREEN,
  RECV_TXN_FINAL_SCREEN
}

enum RECEIVE_TRANSACTION_STATUS_ETH {
  RECV_TXN_FIND_XPUB_ETH = 1,
  RECV_TXN_XPUB_NOT_FOUND_ETH,
  RECV_TXN_ENTER_PIN_ETH,
  RECV_TXN_ENTER_PASSPHRASE_ETH,
  RECV_TXN_CONFIRM_PASSPHRASE_ETH,
  RECV_TXN_CHECK_PIN_ETH,
  RECV_TXN_TAP_CARD_ETH,
  RECV_TXN_TAP_CARD_SEND_CMD_ETH,
  RECV_TXN_READ_DEVICE_SHARE_ETH,
  RECV_TXN_DERIVE_ADD_SCREEN_ETH,
  RECV_TXN_DERIVE_ADD_ETH,
  RECV_TXN_DISPLAY_ADDR_ETH,
  RECV_TXN_WAITING_SCREEN_ETH,
  RECV_TXN_FINAL_SCREEN_ETH
}

export class TransactionReceiver extends CyFlow {
  constructor() {
    super();
  }

  async runLegacy({
    connection,
    walletId,
    coinType,
    receiveAddress,
    receiveAddressPath,
    passphraseExists = false
  }: RunParams) {
    const coin = COINS[coinType];

    if (!coin) {
      throw new Error(`Invalid coinType ${coinType}`);
    }

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
  }

  async runOperation({
    connection,
    walletId,
    coinType,
    receiveAddress,
    receiveAddressPath,
    passphraseExists = false,
    pinExists = false
  }: RunParams) {
    const coin = COINS[coinType];

    if (!coin) {
      throw new Error(`Invalid coinType ${coinType}`);
    }

    logger.info('Receive addr data', {
      coin: coinType,
      receiveAddress,
      receiveAddressPath,
      walletId
    });

    const sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 59,
      data: walletId + receiveAddressPath,
      sequenceNumber
    });

    this.emit('derivationPathSent');

    let requestAcceptedState = 0;
    let passphraseEnteredState = 0;
    let pinEnteredState = 0;
    let cardTapState = 0;

    this.emit('receiveAddress', receiveAddress);

    const isEth = [CoinGroup.Ethereum, CoinGroup.Ethereum].includes(coin.group);
    let requestAcceptedCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_FIND_XPUB;
    let passphraseEnteredCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_CONFIRM_PASSPHRASE;
    let pinEnteredCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_ENTER_PIN;
    let cardTapCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_TAP_CARD_SEND_CMD;

    if (isEth) {
      requestAcceptedCmdStatus =
        RECEIVE_TRANSACTION_STATUS_ETH.RECV_TXN_FIND_XPUB_ETH;
      passphraseEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_ETH.RECV_TXN_CONFIRM_PASSPHRASE_ETH;
      pinEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_ETH.RECV_TXN_CHECK_PIN_ETH;
      cardTapCmdStatus =
        RECEIVE_TRANSACTION_STATUS_ETH.RECV_TXN_TAP_CARD_SEND_CMD_ETH;
    }

    const addressVerified = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [75, 76, 64, 63, 65, 71, 81],
      onStatus: status => {
        if (
          status.flowStatus >= requestAcceptedCmdStatus &&
          requestAcceptedState === 0
        ) {
          requestAcceptedState = 1;
        }

        if (
          passphraseExists &&
          status.flowStatus >= passphraseEnteredCmdStatus &&
          passphraseEnteredState === 0
        ) {
          passphraseEnteredState = 1;
        }

        if (
          pinExists &&
          status.flowStatus >= pinEnteredCmdStatus &&
          pinEnteredState === 0
        ) {
          pinEnteredState = 1;
        }

        if (status.flowStatus >= cardTapCmdStatus && cardTapState === 0) {
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

    if (addressVerified.commandType === 75) {
      this.emit('locked');
      throw new ExitFlowError();
    }

    if (addressVerified.commandType === 76) {
      if (addressVerified.data.startsWith('02')) {
        // Wallet does not exist
        this.emit('noWalletFound', false);
      } else {
        // Wallet is in partial state
        this.emit('noWalletFound', true);
      }
      throw new ExitFlowError();
    }

    if (addressVerified.commandType === 63) {
      this.emit('coinsConfirmed', false);
      throw new ExitFlowError();
    }
    if (addressVerified.commandType === 65) {
      this.emit('noXpub');
      throw new ExitFlowError();
    }
    if (addressVerified.commandType === 81) {
      this.emit('noWalletOnCard');
      throw new ExitFlowError();
    }
    if (addressVerified.commandType === 71) {
      this.emit('cardError');
      throw new ExitFlowError();
    }

    if (addressVerified.data.startsWith('01')) {
      const addressHex = addressVerified.data.slice(2);
      let address = '';

      if (coin instanceof EthCoinData) {
        address = `0x${addressHex.toLowerCase()}`;
      } else {
        address = Buffer.from(addressHex, 'hex').toString().toLowerCase();
      }

      this.emit('addressVerified', address);
    } else if (addressVerified.data === '00') {
      this.emit('addressVerified', false);
      throw new ExitFlowError();
    } else {
      throw new Error('Invalid command');
    }
  }

  async run(params: TransactionReceiverRunOptions) {
    const {
      connection,
      addressDB,
      walletId,
      coinType,
      xpub,
      zpub,
      contractAbbr = 'ETH'
    } = params;

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
        const packetVersion = connection.getPacketVersion();
        if (packetVersion === PacketVersionMap.v3) {
          await this.runOperation({
            ...params,
            receiveAddress,
            receiveAddressPath
          });
        } else {
          await this.runLegacy({
            ...params,
            receiveAddress,
            receiveAddressPath
          });
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
