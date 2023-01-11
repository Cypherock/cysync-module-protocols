import {
  COINS,
  EthCoinData,
  PacketVersionMap,
  StatusData
} from '@cypherock/communication';
import { EthereumWallet } from '@cypherock/wallet';

import { commandHandler76 } from '../../handlers';
import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';
import { SEND_TRANSACTION_STATUS_ETH } from '../sendTransaction';

export interface SignMessageRunOptions extends CyFlowRunOptions {
  walletId: string;
  pinExists: boolean;
  passphraseExists: boolean;
  xpub: string;
  accountId: string;
  accountIndex: number;
  accountType: string;
  coinId: string;
  message: string;
  requestType: number;
}

interface RunParams extends SignMessageRunOptions {
  metaData: string;
  messageHex: string;
  wallet: EthereumWallet;
}

export class SignMessage extends CyFlow {
  constructor() {
    super();
  }

  async runOperation({
    connection,
    walletId,
    pinExists,
    passphraseExists,
    coinId,
    metaData,
    messageHex
  }: RunParams) {
    const coin = COINS[coinId];

    if (!coin) {
      throw new Error(`Invalid coinId ${coinId}`);
    }

    logger.info('Sign data', {
      coin: coinId,
      metaData,
      messageHex
    });

    let sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 93,
      data: walletId + metaData,
      sequenceNumber
    });
    this.emit('metadataSent');

    let requestAcceptedState = 0;
    let recipientVerifiedState = 0;
    let passphraseEnteredState = 0;
    let pinEnteredState = 0;
    let cardTapState = 0;

    const requestAcceptedCmdStatus =
      SEND_TRANSACTION_STATUS_ETH.SEND_TXN_VERIFY_COIN_ETH;
    const recipientVerifiedCmdStatus =
      SEND_TRANSACTION_STATUS_ETH.SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_ETH;
    const passphraseEnteredCmdStatus =
      SEND_TRANSACTION_STATUS_ETH.SEND_TXN_ENTER_PIN_ETH;
    const pinEnteredCmdStatus =
      SEND_TRANSACTION_STATUS_ETH.SEND_TXN_TAP_CARD_SEND_CMD_ETH;
    const cardTapCmdStatus =
      SEND_TRANSACTION_STATUS_ETH.SEND_TXN_TAP_CARD_SEND_CMD_ETH;

    const onStatus = (status: StatusData) => {
      if (
        status.flowStatus >= requestAcceptedCmdStatus &&
        requestAcceptedState === 0
      ) {
        requestAcceptedState = 1;
      }

      if (
        status.flowStatus >= recipientVerifiedCmdStatus &&
        recipientVerifiedState === 0
      ) {
        recipientVerifiedState = 1;
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

      if (recipientVerifiedState === 1) {
        recipientVerifiedState = 2;
        this.emit('verified', true);
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
        this.emit('cardsTapped', true);
      }
    };

    const receivedData = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [75, 76, 94, 93],
      onStatus
    });

    if (receivedData.commandType === 75) {
      logger.info('Wallet is locked');
      this.emit('locked');
      throw new ExitFlowError();
    }

    if (receivedData.commandType === 76) {
      commandHandler76(receivedData, this);
    }

    const coinsConfirmed = receivedData.data.slice(0, 2);
    const acceptableTxnSize = parseInt(receivedData.data.slice(2), 16) * 2;
    logger.info('Acceptable Message size', { acceptableTxnSize });

    if (acceptableTxnSize < messageHex.length) {
      this.emit('txnTooLarge');
      this.flowInterupted = true;
      throw new ExitFlowError();
    }

    if (coinsConfirmed === '00') {
      this.emit('coinsConfirmed', false);
      throw new ExitFlowError();
    }
    this.emit('coinsConfirmed', true);

    if (messageHex === '') {
      throw new Error('Some internal error occurred');
    }

    sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 94,
      data: messageHex,
      sequenceNumber
    });

    const signature = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [93, 94, 95, 79, 81, 71, 75],
      onStatus
    });

    if (receivedData.commandType === 75) {
      logger.info('Wallet is locked');
      this.emit('locked');
      throw new ExitFlowError();
    }

    if (signature.commandType === 79 || signature.commandType === 93) {
      this.emit('coinsConfirmed', false);
      throw new ExitFlowError();
    }

    if (signature.commandType === 81) {
      this.emit('noWalletOnCard');
      throw new ExitFlowError();
    }

    if (signature.commandType === 71) {
      this.emit('cardError');
      throw new ExitFlowError();
    }

    sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 42,
      data: '01',
      sequenceNumber
    });

    logger.info('Message signature', { signature: signature.data });
    this.emit('signature', '0x' + signature.data);
  }

  async run(params: SignMessageRunOptions) {
    const {
      connection,
      sdkVersion,
      xpub,
      accountIndex,
      coinId,
      message,
      requestType
    } = params;

    this.flowInterupted = false;

    try {
      this.cancelled = false;
      let messageHex = '';
      let metaData = '';

      const coin = COINS[coinId];

      if (!coin) {
        throw new Error(`Invalid coinId ${coinId}`);
      }

      if (!(coin instanceof EthCoinData)) {
        throw new Error(`Invalid coinId ${coinId}, expected only EthCoinData`);
      }

      const wallet = new EthereumWallet(accountIndex, xpub, coin);

      metaData = await wallet.generateMetaData(sdkVersion);
      messageHex = await wallet.generateMessageHex(message, requestType);

      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        const packetVersion = connection.getPacketVersion();
        if (packetVersion === PacketVersionMap.v3) {
          await this.runOperation({
            ...params,
            wallet,
            messageHex,
            metaData
          });
        } else {
          throw new Error('Unsupported packet version');
        }
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      if (!(e instanceof ExitFlowError)) {
        this.flowInterupted = true;
        this.emit('error', e);
      }
    } finally {
      await this.onEnd(connection, {
        dontAbort: !this.flowInterupted
      });
    }
  }
}
