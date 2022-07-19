import {
  CoinGroup,
  COINS,
  EthCoinData,
  NearCoinData,
  PacketVersionMap
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
  RECV_TXN_DISPLAY_ADDR_NEAR,
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

enum RECEIVE_TRANSACTION_STATUS_NEAR {
  RECV_TXN_FIND_XPUB_NEAR = 1,
  RECV_TXN_ENTER_PASSPHRASE_NEAR,
  RECV_TXN_CONFIRM_PASSPHRASE_NEAR,
  RECV_TXN_CHECK_PIN_NEAR,
  RECV_TXN_ENTER_PIN_NEAR,
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
  RECV_TXN_WAITING_SCREEN_NEAR,
  RECV_TXN_FINAL_SCREEN_NEAR
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
    passphraseExists = false,
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

    let nearBlockVerify = false;
    if (data.commandType === 65 && data.data === '01') {
      this.emit('coinsConfirmed', true);
      if (coin.group === CoinGroup.Near && customAccount) {
        nearBlockVerify = true;
      }
    } else if (data.commandType === 65 && data.data === '02') {
      this.emit('coinsConfirmed', true);
      this.emit('customAccountExists', true);
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

    if (nearBlockVerify) {
      await userAction.promise;
      await connection.sendData(96, '01');
      const verifiedAccountId = await connection.receiveData([97], 60000);
      if (verifiedAccountId.data.startsWith('01')) {
        this.emit('accountVerified', true);
      } else {
        this.emit('accountVerified', false);
        throw new ExitFlowError();
      }
    }

    let nearReplaceAccount = false;

    this.emit('receiveAddress', receiveAddress);
    const addressesVerified = await connection.receiveData([64], 60000);
    if (addressesVerified.data.startsWith('01')) {
      const addressHex = addressesVerified.data.slice(2);
      let address = '';

      if (coin instanceof EthCoinData) {
        address = `0x${addressHex.toLowerCase()}`;
      } else if (coin instanceof NearCoinData) {
        address = addressHex;
      } else {
        address = Buffer.from(addressHex, 'hex').toString().toLowerCase();
      }

      this.emit('addressVerified', address);
    } else if (addressesVerified.data.startsWith('02')) {
      this.emit('addressVerified', customAccount);
      this.emit('replaceAccountRequired', true);
      nearReplaceAccount = true;
    } else if (addressesVerified.data === '00') {
      this.emit('addressVerified', false);
      throw new ExitFlowError();
    } else {
      throw new Error('Invalid command');
    }

    if (nearReplaceAccount) {
      await replaceAccountAction.promise;
      await connection.sendData(98, '01');
      const verifiedReplaceAccount = await connection.receiveData([99], 60000);
      if (verifiedReplaceAccount.data.startsWith('01')) {
        this.emit('replaceAccountVerified', true);
      } else {
        this.emit('replaceAccountVerified', false);
        throw new ExitFlowError();
      }
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

    this.emit('receiveAddress', receiveAddress);

    const isEth = [CoinGroup.Ethereum, CoinGroup.Ethereum].includes(coin.group);
    const isNear = [CoinGroup.Near].includes(coin.group);

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
    } else if (isNear) {
      requestAcceptedCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_FIND_XPUB_NEAR;
      passphraseEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_CONFIRM_PASSPHRASE_NEAR;
      pinEnteredCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_CHECK_PIN_NEAR;
      cardTapCmdStatus =
        RECEIVE_TRANSACTION_STATUS_NEAR.RECV_TXN_TAP_CARD_SEND_CMD_NEAR;
    }

    if (isNear) {
      const coinsConfirmed = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [75, 76, 65, 63],
        onStatus: status => {
          if (
            status.flowStatus >= requestAcceptedCmdStatus &&
            requestAcceptedState === 0
          ) {
            requestAcceptedState = 1;
          }

          if (requestAcceptedState === 1) {
            requestAcceptedState = 2;
            this.emit('coinsConfirmed', true);
          }
        }
      });

      if (coinsConfirmed.commandType === 75) {
        this.emit('locked');
        throw new ExitFlowError();
      }

      if (coinsConfirmed.commandType === 76) {
        commandHandler76(coinsConfirmed, this);
      }

      if (coinsConfirmed.commandType === 63) {
        this.emit('coinsConfirmed', false);
        throw new ExitFlowError();
      }

      if (coinsConfirmed.commandType === 65 && coinsConfirmed.data === '01') {
        this.emit('coinsConfirmed', true);
      } else if (
        coinsConfirmed.commandType === 65 &&
        coinsConfirmed.data === '02'
      ) {
        this.emit('coinsConfirmed', true);
        this.emit('customAccountExists', true);
      } else if (
        coinsConfirmed.commandType === 65 &&
        coinsConfirmed.data === '00'
      ) {
        this.emit('noXpub');
        throw new ExitFlowError();
      } else {
        throw new Error('Invalid command');
      }

      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 42,
        data: '01',
        sequenceNumber
      });
      const nearCustomAccount = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [96, 71, 81, 64],
        onStatus: status => {
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

      if (nearCustomAccount.commandType === 81) {
        this.emit('noWalletOnCard');
        throw new ExitFlowError();
      }
      if (nearCustomAccount.commandType === 71) {
        this.emit('cardError');
        throw new ExitFlowError();
      }
      if (nearCustomAccount.commandType === 96) {
        await userAction.promise;

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
          expectedCommandTypes: [97, 64],
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

        if (nearAddressVerified.commandType === 97) {
          this.emit('accountVerified', false);
          throw new ExitFlowError();
        }

        if (nearAddressVerified.data.startsWith('01')) {
          const addressHex = nearAddressVerified.data.slice(2);
          this.emit('addressVerified', addressHex);
        } else if (nearAddressVerified.data === '00') {
          this.emit('addressVerified', false);
          throw new ExitFlowError();
        } else if (nearAddressVerified.data.startsWith('02')) {
          this.emit('addressVerified', customAccount);
          this.emit('replaceAccountRequired', true);

          await replaceAccountAction.promise;
          sequenceNumber = connection.getNewSequenceNumber();
          await connection.sendCommand({
            commandType: 98,
            data: '01',
            sequenceNumber
          });
          const verifiedReplaceAccount = await connection.waitForCommandOutput({
            sequenceNumber,
            expectedCommandTypes: [99],
            onStatus: () => {}
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
      } else if (nearCustomAccount.commandType === 64) {
        if (nearCustomAccount.data.startsWith('01')) {
          const addressHex = nearCustomAccount.data.slice(2);
          this.emit('addressVerified', addressHex);
        } else if (nearCustomAccount.data === '00') {
          this.emit('addressVerified', false);
          throw new ExitFlowError();
        } else {
          throw new Error('Invalid command');
        }
      } else {
        throw new Error('Invalid command');
      }

      return;
    }

    const addressVerified = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [75, 76, 64, 65, 63, 71, 81],
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
      commandHandler76(addressVerified, this);
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
      } else if (coin instanceof NearCoinData) {
        address = addressHex;
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
        receiveAddressPath = await wallet.getDerivationPathForCustomAccount(
          customAccount
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
