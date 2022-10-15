import {
  CoinGroup,
  COINS,
  DeviceError,
  DeviceErrorType,
  DeviceIdleState,
  EthCoinData,
  NearCoinData,
  PacketVersionMap,
  SolanaCoinData,
  StatusData
} from '@cypherock/communication';
import { AddressDB } from '@cypherock/database';
import newWallet from '@cypherock/wallet';

import { commandHandler76 } from '../../handlers';
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
  customAccount?: string;
  userAction?: any;
  replaceAccountAction?: any;
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
  RECV_TXN_ENTER_PASSPHRASE_ETH,
  RECV_TXN_CONFIRM_PASSPHRASE_ETH,
  RECV_TXN_ENTER_PIN_ETH,
  RECV_TXN_CHECK_PIN_ETH,
  RECV_TXN_TAP_CARD_ETH,
  RECV_TXN_TAP_CARD_SEND_CMD_ETH,
  RECV_TXN_READ_DEVICE_SHARE_ETH,
  RECV_TXN_DERIVE_ADD_SCREEN_ETH,
  RECV_TXN_DERIVE_ADD_ETH,
  RECV_TXN_DISPLAY_ADDR_ETH
}

enum RECEIVE_TRANSACTION_STATUS_NEAR {
  RECV_TXN_FIND_XPUB_NEAR = 1,
  RECV_TXN_ENTER_PASSPHRASE_NEAR,
  RECV_TXN_CONFIRM_PASSPHRASE_NEAR,
  RECV_TXN_ENTER_PIN_NEAR,
  RECV_TXN_CHECK_PIN_NEAR,
  RECV_TXN_TAP_CARD_NEAR,
  RECV_TXN_TAP_CARD_SEND_CMD_NEAR,
  RECV_TXN_READ_DEVICE_SHARE_NEAR,
  RECV_TXN_DERIVE_ADD_SCREEN_NEAR,
  RECV_TXN_DERIVE_ADD_NEAR,
  RECV_TXN_WAIT_FOR_LINK_NEAR,
  RECV_TXN_DISPLAY_ACC_NEAR,
  RECV_TXN_DISPLAY_ADDR_NEAR,
  RECV_TXN_WAIT_FOR_REPLACE_NEAR_SCREEN,
  RECV_TXN_WAIT_FOR_REPLACE_NEAR,
  RECV_TXN_SELECT_REPLACE_ACC_NEAR,
  RECV_TXN_VERIFY_SAVE_ACC_NEAR,
  RECV_TXN_FINAL_SCREEN_NEAR
}

enum RECEIVE_TRANSACTION_STATUS_SOLANA {
  RECV_TXN_FIND_XPUB_SOLANA = 1,
  RECV_TXN_ENTER_PASSPHRASE_SOLANA,
  RECV_TXN_CONFIRM_PASSPHRASE_SOLANA,
  RECV_TXN_ENTER_PIN_SOLANA,
  RECV_TXN_CHECK_PIN_SOLANA,
  RECV_TXN_TAP_CARD_SOLANA,
  RECV_TXN_TAP_CARD_SEND_CMD_SOLANA,
  RECV_TXN_READ_DEVICE_SHARE_SOLANA,
  RECV_TXN_DERIVE_ADD_SCREEN_SOLANA,
  RECV_TXN_DERIVE_ADD_SOLANA,
  RECV_TXN_DISPLAY_ADDR_SOLANA
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
      commandHandler76(data, this);
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
    pinExists = false,
    customAccount,
    userAction,
    replaceAccountAction
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

    let sequenceNumber = connection.getNewSequenceNumber();
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
    let nearAccountDerivingState = 0;
    let nearReplaceAccountSelectedState = 0;

    this.emit('receiveAddress', receiveAddress);

    const isEth = [CoinGroup.Ethereum, CoinGroup.Ethereum].includes(coin.group);
    const isNear = [CoinGroup.Near].includes(coin.group);
    const isSolana = [CoinGroup.Solana].includes(coin.group);

    let requestAcceptedCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_FIND_XPUB;
    let passphraseEnteredCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_ENTER_PIN;
    let pinEnteredCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_TAP_CARD_SEND_CMD;
    let cardTapCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_TAP_CARD_SEND_CMD;
    let derivingAddressCmdStatus: number =
      RECEIVE_TRANSACTION_STATUS.RECV_TXN_DERIVE_ADD_SCREEN;
    let nearReplaceAccountSelectedStatus = 0;

    if (isEth) {
      requestAcceptedCmdStatus =
        RECEIVE_TRANSACTION_STATUS_ETH.RECV_TXN_FIND_XPUB_ETH;
      passphraseEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_ETH.RECV_TXN_ENTER_PIN_ETH;
      pinEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_ETH.RECV_TXN_TAP_CARD_SEND_CMD_ETH;
      cardTapCmdStatus =
        RECEIVE_TRANSACTION_STATUS_ETH.RECV_TXN_TAP_CARD_SEND_CMD_ETH;
    } else if (isNear) {
      requestAcceptedCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_FIND_XPUB_NEAR;
      passphraseEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_ENTER_PIN_NEAR;
      pinEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_TAP_CARD_SEND_CMD_NEAR;
      cardTapCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_TAP_CARD_SEND_CMD_NEAR;
      derivingAddressCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_DERIVE_ADD_NEAR;
      nearReplaceAccountSelectedStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_VERIFY_SAVE_ACC_NEAR;
    } else if (isSolana) {
      requestAcceptedCmdStatus =
        RECEIVE_TRANSACTION_STATUS_SOLANA.RECV_TXN_FIND_XPUB_SOLANA;
      passphraseEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_SOLANA.RECV_TXN_ENTER_PIN_SOLANA;
      pinEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_SOLANA.RECV_TXN_TAP_CARD_SEND_CMD_SOLANA;
      cardTapCmdStatus =
        RECEIVE_TRANSACTION_STATUS_SOLANA.RECV_TXN_TAP_CARD_SEND_CMD_SOLANA;
      derivingAddressCmdStatus =
        RECEIVE_TRANSACTION_STATUS_SOLANA.RECV_TXN_DERIVE_ADD_SOLANA;
    }

    let stopWaitForAbort = false;

    const waitForAbort = async () => {
      let status = await connection.getStatus();
      logger.info('Starting status polling', { status });
      while (status.deviceIdleState !== DeviceIdleState.IDLE) {
        if (stopWaitForAbort) return;
        status = await connection.getStatus({ logsDisabled: true });
      }
      logger.info('Ended status polling', { status });
      throw new DeviceError(DeviceErrorType.DEVICE_ABORT);
    };

    const onStatus = (status: StatusData) => {
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
    };

    const addressVerified = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [75, 76, 64, 65, 63, 71, 81, 91, 79],
      onStatus: status => {
        onStatus(status);
        // receive 65 before this status is handled for custom account exists case
        if (
          status.flowStatus >= derivingAddressCmdStatus &&
          nearAccountDerivingState === 0
        ) {
          nearAccountDerivingState = 1;
        }
        if (nearAccountDerivingState === 1 && customAccount) {
          nearAccountDerivingState = 2;
          this.emit('customAccountExists', true);
        }
      }
    });

    if (addressVerified.commandType === 75) {
      this.emit('locked');
      throw new ExitFlowError();
    }

    if (addressVerified.commandType === 76) {
      commandHandler76(addressVerified, this);
    }

    if ([79, 91, 63].includes(addressVerified.commandType)) {
      this.emit('coinsConfirmed', false);
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

    if (addressVerified.commandType === 64) {
      if (addressVerified.data.startsWith('01')) {
        const addressHex = addressVerified.data.slice(2);
        let address = '';

        if (coin instanceof EthCoinData) {
          address = `0x${addressHex.toLowerCase()}`;
        } else if (coin instanceof NearCoinData) {
          address = customAccount || addressHex;
        } else if (coin instanceof SolanaCoinData) {
          // Remove trailing null characters from address
          address = Buffer.from(addressHex, 'hex')
            .toString()
            .replace(/^[\s\uFEFF\xA0\0]+|[\s\uFEFF\xA0\0]+$/g, '');
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
    } else if (addressVerified.commandType === 65 && isNear) {
      this.emit('cardTapped');

      const waitForUserPromise = async () => {
        await userAction.promise;
        stopWaitForAbort = true;
      };

      await Promise.race([waitForUserPromise(), waitForAbort()]);

      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 96,
        data: '01',
        sequenceNumber
      });
      let nearAccountVerifiedState = 0;
      const nearAccountVerifiedStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_DISPLAY_ADDR_NEAR;
      const nearAddressVerified = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [64],
        onStatus: status => {
          if (
            status.flowStatus >= nearAccountVerifiedStatus &&
            nearAccountVerifiedState === 0
          ) {
            nearAccountVerifiedState = 1;
          }

          if (nearAccountVerifiedState === 1) {
            nearAccountVerifiedState = 2;
            this.emit('accountVerified', true);
          }
        }
      });

      if (nearAddressVerified.data.startsWith('01')) {
        const addressHex = nearAddressVerified.data.slice(2);
        this.emit('addressVerified', addressHex);
      } else if (nearAddressVerified.data === '00') {
        this.emit('addressVerified', false);
        throw new ExitFlowError();
      } else if (nearAddressVerified.data.startsWith('02')) {
        this.emit('addressVerified', customAccount);
        this.emit('replaceAccountRequired', true);

        const waitForReplaceAccount = async () => {
          await replaceAccountAction.promise;
          stopWaitForAbort = true;
        };

        stopWaitForAbort = false;
        await Promise.race([waitForReplaceAccount(), waitForAbort()]);

        sequenceNumber = connection.getNewSequenceNumber();
        await connection.sendCommand({
          commandType: 97,
          data: '01',
          sequenceNumber
        });
        const verifiedReplaceAccount = await connection.waitForCommandOutput({
          sequenceNumber,
          expectedCommandTypes: [97],
          onStatus: (status: StatusData) => {
            if (
              status.flowStatus >= nearReplaceAccountSelectedStatus &&
              nearReplaceAccountSelectedState === 0
            ) {
              nearReplaceAccountSelectedState = 1;
            }
            if (
              status.flowStatus < nearReplaceAccountSelectedStatus &&
              nearReplaceAccountSelectedState === 2
            ) {
              nearReplaceAccountSelectedState = 3;
            }
            if (nearReplaceAccountSelectedState === 1) {
              nearReplaceAccountSelectedState = 2;
              this.emit('replaceAccountSelected', true);
            }
            if (nearReplaceAccountSelectedState === 3) {
              nearReplaceAccountSelectedState = 0;
              this.emit('replaceAccountSelected', false);
            }
          }
        });
        if (verifiedReplaceAccount.data.startsWith('01')) {
          this.emit('replaceAccountVerified', true);
        } else {
          this.emit('replaceAccountVerified', false);
          throw new ExitFlowError();
        }
      } else {
        throw new Error('Invalid command');
      }
    } else {
      throw new Error('Invalid command');
    }
  }

  async run(params: TransactionReceiverRunOptions) {
    const {
      connection,
      sdkVersion,
      addressDB,
      walletId,
      coinType,
      xpub,
      zpub,
      contractAbbr = 'ETH',
      customAccount
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
        receiveAddress = wallet.newReceiveAddress().toLowerCase();
        receiveAddressPath = await wallet.getDerivationPath(
          sdkVersion,
          contractAbbr
        );
      } else if (coin instanceof NearCoinData && customAccount) {
        wallet = newWallet({
          coinType,
          xpub,
          walletId,
          zpub,
          addressDB
        });
        receiveAddress = customAccount;
        receiveAddressPath = await wallet.getDerivationPathForCustomAccount(
          customAccount,
          sdkVersion
        );
      } else {
        wallet = newWallet({
          coinType,
          xpub,
          walletId,
          zpub,
          addressDB
        });
        receiveAddress = await wallet.newReceiveAddress();
        receiveAddressPath = await wallet.getDerivationPath(
          sdkVersion,
          receiveAddress
        );
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
