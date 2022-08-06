import {
  CoinGroup,
  COINS,
  EthCoinData,
  NearCoinData,
  PacketVersionMap,
  StatusData
} from '@cypherock/communication';
import { AddressDB, TransactionDB } from '@cypherock/database';
import Server from '@cypherock/server-wrapper';
import { BitcoinWallet, EthereumWallet, NearWallet } from '@cypherock/wallet';
import BigNumber from 'bignumber.js';

import { commandHandler76 } from '../../handlers';
import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

export interface TransactionSenderRunOptions extends CyFlowRunOptions {
  transactionDB: TransactionDB;
  addressDB: AddressDB;
  walletId: string;
  pinExists: boolean;
  passphraseExists: boolean;
  xpub: string;
  zpub?: string;
  customAccount?: string;
  newAccountId?: string;
  coinType: string;
  outputList: Array<{ address: string; value: BigNumber }>;
  fee: number;
  isSendAll?: boolean;
  data?: {
    gasLimit: number;
    contractAddress?: string;
    contractAbbr?: string;
  };
}

interface RunParams extends TransactionSenderRunOptions {
  metaData: string;
  unsignedTransaction: string;
  utxoList: string[];
  wallet: BitcoinWallet | EthereumWallet | NearWallet;
  txnInfo: any;
  inputs: any[];
}

enum SEND_TRANSACTION_STATUS {
  SEND_TXN_VERIFY_COIN = 1,
  SEND_TXN_UNSIGNED_TXN_WAIT_SCREEN,
  SEND_TXN_UNSIGNED_TXN_RECEIVED,
  SEND_TXN_VERIFY_UTXO_FETCH_RAW_TXN,
  SEND_TXN_VERIFY_UTXO,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS,
  SEND_TXN_VERIFY_RECEIPT_AMOUNT,
  SEND_TXN_CHECK_RECEIPT_FEES_LIMIT,
  SEND_TXN_VERIFY_RECEIPT_FEES,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD,
  SEND_TXN_ENTER_PASSPHRASE,
  SEND_TXN_CONFIRM_PASSPHRASE,
  SEND_TXN_CHECK_PIN,
  SEND_TXN_ENTER_PIN,
  SEND_TXN_TAP_CARD,
  SEND_TXN_TAP_CARD_SEND_CMD,
  SEND_TXN_READ_DEVICE_SHARE,
  SEND_TXN_SIGN_TXN,
  SEND_TXN_WAITING_SCREEN,
  SEND_TXN_FINAL_SCREEN
}

enum SEND_TRANSACTION_STATUS_ETH {
  SEND_TXN_VERIFY_COIN_ETH = 1,
  SEND_TXN_UNSIGNED_TXN_WAIT_SCREEN_ETH,
  SEND_TXN_UNSIGNED_TXN_RECEIVED_ETH,
  SEND_TXN_VERIFY_CONTRACT_ADDRESS,
  SEND_TXN_VERIFY_TXN_NONCE_ETH,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_ETH,
  SEND_TXN_CALCULATE_AMOUNT_ETH,
  SEND_TXN_VERIFY_RECEIPT_AMOUNT_ETH,
  SEND_TXN_VERIFY_RECEIPT_FEES_ETH,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_ETH,
  SEND_TXN_ENTER_PASSPHRASE_ETH,
  SEND_TXN_CONFIRM_PASSPHRASE_ETH,
  SEND_TXN_CHECK_PIN_ETH,
  SEND_TXN_ENTER_PIN_ETH,
  SEND_TXN_TAP_CARD_ETH,
  SEND_TXN_TAP_CARD_SEND_CMD_ETH,
  SEND_TXN_READ_DEVICE_SHARE_ETH,
  SEND_TXN_SIGN_TXN_ETH,
  SEND_TXN_WAITING_SCREEN_ETH,
  SEND_TXN_FINAL_SCREEN_ETH
}

enum SEND_TRANSACTION_STATUS_NEAR {
  SEND_TXN_VERIFY_COIN_NEAR = 1,
  SEND_TXN_UNSIGNED_TXN_WAIT_SCREEN_NEAR,
  SEND_TXN_VERIFY_TXN_NONCE_NEAR,
  SEND_TXN_VERIFY_SENDER_ADDRESS_NEAR,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_NEAR,
  SEND_TXN_CALCULATE_AMOUNT_NEAR,
  SEND_TXN_VERIFY_RECEIPT_AMOUNT_NEAR,
  SEND_TXN_VERIFY_RECEIPT_FEES_NEAR,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_NEAR,
  SEND_TXN_ENTER_PASSPHRASE_NEAR,
  SEND_TXN_CONFIRM_PASSPHRASE_NEAR,
  SEND_TXN_CHECK_PIN_NEAR,
  SEND_TXN_ENTER_PIN_NEAR,
  SEND_TXN_TAP_CARD_NEAR,
  SEND_TXN_TAP_CARD_SEND_CMD_NEAR,
  SEND_TXN_READ_DEVICE_SHARE_NEAR,
  SEND_TXN_SIGN_TXN_NEAR,
  SEND_TXN_WAITING_SCREEN_NEAR,
  SEND_TXN_FINAL_SCREEN_NEAR
}

export class TransactionSender extends CyFlow {
  constructor() {
    super();
  }

  async runLegacy({
    connection,
    walletId,
    pinExists,
    passphraseExists,
    coinType,
    metaData,
    unsignedTransaction,
    utxoList,
    wallet,
    txnInfo,
    inputs
  }: RunParams) {
    const coin = COINS[coinType];

    if (!coin) {
      throw new Error(`Invalid coinType ${coinType}`);
    }

    logger.info('Send data', {
      coin: coinType,
      metaData,
      unsignedTransaction
    });
    await connection.sendData(50, walletId + metaData);
    this.emit('metadataSent');

    const receivedData = await connection.receiveData([51, 75, 76], 30000);
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
    logger.info('Acceptable Txn size', { acceptableTxnSize });

    if (acceptableTxnSize < unsignedTransaction.length) {
      this.emit('txnTooLarge');
      this.flowInterupted = true;
      throw new ExitFlowError();
    }

    if (coinsConfirmed === '01') {
      this.emit('coinsConfirmed', true);
    } else if (coinsConfirmed === '00') {
      this.emit('coinsConfirmed', false);
      throw new ExitFlowError();
    } else {
      throw new Error('Unidentified command from the device');
    }

    if (unsignedTransaction === '') {
      logger.info('Insufficient funds.');
      this.emit('insufficientFunds', true);
      this.flowInterupted = true;
      throw new ExitFlowError();
    }

    await connection.sendData(52, unsignedTransaction);

    if (!(coin instanceof EthCoinData)) {
      const utxoRequest = await connection.receiveData([51], 10000);
      if (utxoRequest.data !== '02') {
        throw new Error('Invalid data from device');
      }

      for (const utxo of utxoList) {
        await connection.sendData(51, utxo);
        const utxoResponse = await connection.receiveData([51], 10000);
        if (utxoResponse.data.startsWith('00')) {
          throw new Error('UTXO was not verified');
        }
      }
    }

    const recipientVerified = await connection.receiveData([53], 120000);
    if (recipientVerified.data === '01') {
      this.emit('verified', true);
    } else {
      this.emit('verified', parseInt(recipientVerified.data, 16));
      throw new ExitFlowError();
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

    if (pinExists) {
      const pinData = await connection.receiveData([47, 79, 81], 90000);
      if (pinData.commandType === 79) {
        this.emit('coinsConfirmed', false);
        throw new ExitFlowError();
      }
      if (pinData.commandType === 81) {
        this.emit('noWalletOnCard');
        throw new ExitFlowError();
      }
      const pinEntered = pinData.data;

      if (pinEntered === '01') {
        this.emit('pinEntered', true);
      } else {
        this.emit('pinEntered', false);
        throw new ExitFlowError();
      }
    }

    const data1 = await connection.receiveData([48, 79, 81, 71], 90000);
    if (data1.commandType === 79) {
      this.emit('coinsConfirmed', false);
      throw new ExitFlowError();
    }
    if (data1.commandType === 81) {
      this.emit('noWalletOnCard');
      throw new ExitFlowError();
    }
    if (data1.commandType === 71) {
      this.emit('cardError');
      throw new ExitFlowError();
    }
    this.emit('cardsTapped', true);

    if (wallet instanceof EthereumWallet) {
      if (!(coin instanceof EthCoinData)) {
        throw new Error('ETH Wallet found, but coin is not ETH.');
      }

      const signedTxn = await connection.receiveData([54], 90000);
      await connection.sendData(42, '01');

      const signedTxnEth = wallet.getSignedTransaction(
        unsignedTransaction,
        signedTxn.data,
        coin.chain
      );

      try {
        const isVerified = await wallet.verifySignedTxn(signedTxnEth);
        this.emit('signatureVerify', { isVerified, index: 0 });
      } catch (error) {
        this.emit('signatureVerify', {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxnEth });
      this.emit('signedTxn', signedTxnEth);
    } else {
      if (wallet instanceof NearWallet)
        throw new Error('Near wallet not supported in legacy mode');

      const inputSignatures: string[] = [];
      for (const _ of txnInfo.inputs) {
        const inputSig = await connection.receiveData([54], 90000);
        await connection.sendData(42, '01');
        inputSignatures.push(inputSig.data);
      }

      const signedTxn = wallet.getSignedTransaction(
        unsignedTransaction,
        inputSignatures
      );

      try {
        const { isVerified, index } = await wallet.verifySignedTxn(
          signedTxn,
          inputs
        );
        this.emit('signatureVerify', { isVerified, index });
      } catch (error) {
        this.emit('signatureVerify', {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxn });
      this.emit('signedTxn', signedTxn);
    }
  }

  async runOperation({
    connection,
    walletId,
    pinExists,
    passphraseExists,
    coinType,
    metaData,
    unsignedTransaction,
    utxoList,
    wallet,
    txnInfo,
    inputs
  }: RunParams) {
    const coin = COINS[coinType];

    if (!coin) {
      throw new Error(`Invalid coinType ${coinType}`);
    }

    logger.info('Send data', {
      coin: coinType,
      metaData,
      unsignedTransaction
    });

    let sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 50,
      data: walletId + metaData,
      sequenceNumber
    });
    this.emit('metadataSent');

    const isEth = [CoinGroup.Ethereum, CoinGroup.Ethereum].includes(coin.group);
    const isNear = [CoinGroup.Near].includes(coin.group);

    let requestAcceptedState = 0;
    let recipientVerifiedState = 0;
    let passphraseEnteredState = 0;
    let pinEnteredState = 0;
    let cardTapState = 0;

    let requestAcceptedCmdStatus: number =
      SEND_TRANSACTION_STATUS.SEND_TXN_VERIFY_COIN;
    let recipientVerifiedCmdStatus: number =
      SEND_TRANSACTION_STATUS.SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD;
    let passphraseEnteredCmdStatus: number =
      SEND_TRANSACTION_STATUS.SEND_TXN_CONFIRM_PASSPHRASE;
    let pinEnteredCmdStatus: number =
      SEND_TRANSACTION_STATUS.SEND_TXN_ENTER_PIN;
    let cardTapCmdStatus: number =
      SEND_TRANSACTION_STATUS.SEND_TXN_TAP_CARD_SEND_CMD;

    if (isEth) {
      requestAcceptedCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_VERIFY_COIN_ETH;
      recipientVerifiedCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_ETH;
      passphraseEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_CONFIRM_PASSPHRASE_ETH;
      pinEnteredCmdStatus = SEND_TRANSACTION_STATUS_ETH.SEND_TXN_ENTER_PIN_ETH;
      cardTapCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_TAP_CARD_SEND_CMD_ETH;
    } else if (isNear) {
      requestAcceptedCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_VERIFY_COIN_NEAR;
      recipientVerifiedCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_NEAR;
      passphraseEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_CONFIRM_PASSPHRASE_NEAR;
      pinEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_ENTER_PIN_NEAR;
      cardTapCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_TAP_CARD_SEND_CMD_NEAR;
    }

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
      expectedCommandTypes: [75, 76, 51],
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
    logger.info('Acceptable Txn size', { acceptableTxnSize });

    if (acceptableTxnSize < unsignedTransaction.length) {
      this.emit('txnTooLarge');
      this.flowInterupted = true;
      throw new ExitFlowError();
    }

    if (coinsConfirmed === '00') {
      this.emit('coinsConfirmed', false);
      throw new ExitFlowError();
    }
    this.emit('coinsConfirmed', true);

    if (unsignedTransaction === '') {
      logger.info('Insufficient funds.');
      this.emit('insufficientFunds', true);
      this.flowInterupted = true;
      throw new ExitFlowError();
    }

    sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 52,
      data: unsignedTransaction,
      sequenceNumber
    });

    if (!(coin instanceof EthCoinData) && !(coin instanceof NearCoinData)) {
      const utxoRequest = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [51],
        onStatus
      });

      if (utxoRequest.data !== '02') {
        throw new Error('Invalid data from device');
      }

      for (const utxo of utxoList) {
        sequenceNumber = connection.getNewSequenceNumber();
        await connection.sendCommand({
          commandType: 51,
          data: utxo,
          sequenceNumber
        });
        const utxoResponse = await connection.waitForCommandOutput({
          sequenceNumber,
          expectedCommandTypes: [51],
          onStatus: () => {}
        });

        if (utxoResponse.data.startsWith('00')) {
          throw new Error('UTXO was not verified');
        }
      }
    }

    if (wallet instanceof EthereumWallet) {
      if (!(coin instanceof EthCoinData)) {
        throw new Error('ETH Wallet found, but coin is not ETH.');
      }

      const signedTxn = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [54, 79, 81, 71, 53],
        onStatus
      });

      if (signedTxn.commandType === 79 || signedTxn.commandType === 53) {
        this.emit('coinsConfirmed', false);
        throw new ExitFlowError();
      }
      if (signedTxn.commandType === 81) {
        this.emit('noWalletOnCard');
        throw new ExitFlowError();
      }
      if (signedTxn.commandType === 71) {
        this.emit('cardError');
        throw new ExitFlowError();
      }

      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 42,
        data: '01',
        sequenceNumber
      });

      const signedTxnEth = wallet.getSignedTransaction(
        unsignedTransaction,
        signedTxn.data,
        coin.chain
      );

      try {
        const isVerified = await wallet.verifySignedTxn(signedTxnEth);
        this.emit('signatureVerify', { isVerified, index: 0 });
      } catch (error) {
        this.emit('signatureVerify', {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxnEth });
      this.emit('signedTxn', signedTxnEth);
    } else if (wallet instanceof NearWallet) {
      if (!(coin instanceof NearCoinData)) {
        throw new Error('Near Wallet found, but coin is not Near.');
      }

      const signedTxn = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [54, 79, 81, 71, 53],
        onStatus
      });

      if (signedTxn.commandType === 79 || signedTxn.commandType === 53) {
        this.emit('coinsConfirmed', false);
        throw new ExitFlowError();
      }
      if (signedTxn.commandType === 81) {
        this.emit('noWalletOnCard');
        throw new ExitFlowError();
      }
      if (signedTxn.commandType === 71) {
        this.emit('cardError');
        throw new ExitFlowError();
      }

      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 42,
        data: '01',
        sequenceNumber
      });

      const signedTxnNear = wallet.getSignedTransaction(
        unsignedTransaction,
        signedTxn.data
      );

      try {
        const isVerified = await wallet.verifySignedTxn(signedTxnNear);
        this.emit('signatureVerify', { isVerified, index: 0 });
      } catch (error) {
        this.emit('signatureVerify', {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxnNear });
      this.emit('signedTxn', signedTxnNear);
    } else {
      const inputSignatures: string[] = [];
      for (const _ of txnInfo.inputs) {
        sequenceNumber = connection.getNewSequenceNumber();
        await connection.sendCommand({
          commandType: 54,
          data: '00',
          sequenceNumber
        });

        const inputSig = await connection.waitForCommandOutput({
          sequenceNumber,
          expectedCommandTypes: [54, 79, 81, 71, 53],
          onStatus
        });

        if (inputSig.commandType === 79 || inputSig.commandType === 53) {
          this.emit('coinsConfirmed', false);
          throw new ExitFlowError();
        }
        if (inputSig.commandType === 81) {
          this.emit('noWalletOnCard');
          throw new ExitFlowError();
        }
        if (inputSig.commandType === 71) {
          this.emit('cardError');
          throw new ExitFlowError();
        }

        inputSignatures.push(inputSig.data);
      }

      const signedTxn = wallet.getSignedTransaction(
        unsignedTransaction,
        inputSignatures
      );

      try {
        const { isVerified, index } = await wallet.verifySignedTxn(
          signedTxn,
          inputs
        );
        this.emit('signatureVerify', { isVerified, index });
      } catch (error) {
        this.emit('signatureVerify', {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxn });
      this.emit('signedTxn', signedTxn);
    }
  }

  async run(params: TransactionSenderRunOptions) {
    const {
      connection,
      addressDB,
      transactionDB,
      walletId,
      xpub,
      zpub,
      coinType,
      outputList,
      fee,
      isSendAll = false,
      data = {
        gasLimit: 21000,
        contractAddress: undefined,
        contractAbbr: undefined
      },
      customAccount,
      newAccountId
    } = params;
    this.flowInterupted = false;
    try {
      this.cancelled = false;
      let unsignedTransaction = '';
      let metaData = '';
      let feeRate;
      let wallet: BitcoinWallet | EthereumWallet | NearWallet;
      let totalFees: number;
      let txnInfo: any;
      let inputs: any[];
      let outputs: any[];
      let utxoList: any[] = [];
      let sendMaxAmount: string | null = null;

      const coin = COINS[coinType];

      if (!coin) {
        throw new Error(`Invalid coinType ${coinType}`);
      }

      if (coin instanceof EthCoinData) {
        const token = data.contractAbbr
          ? coin.tokenList[data.contractAbbr.toLowerCase()]
          : coin;

        if (!token) {
          throw new Error('Invalid token or coinType');
        }

        const { gasLimit, contractAddress, contractAbbr } = data;
        const { network, chain } = coin;
        wallet = new EthereumWallet(xpub, coin);

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.eth.transaction
            .getFees({ network, responseType: 'v2' })
            .request();
          feeRate = Math.round(res.data.fees / 1000000000);
        }

        metaData = await wallet.generateMetaData(contractAddress, contractAbbr);

        let amount: BigNumber;
        let txFee: BigNumber;

        const unsignedResp = await wallet.generateUnsignedTransaction(
          outputList[0].address,
          outputList[0].value,
          feeRate,
          gasLimit,
          chain,
          isSendAll,
          contractAddress
        );
        ({
          amount,
          fee: txFee,
          txn: unsignedTransaction,
          inputs,
          outputs
        } = unsignedResp);
        sendMaxAmount = amount
          .dividedBy(new BigNumber(token.multiplier))
          .toString();

        totalFees = txFee.dividedBy(new BigNumber(coin.multiplier)).toNumber();
      } else if (coin instanceof NearCoinData) {
        wallet = new NearWallet(xpub, coin);
        metaData = await wallet.generateMetaData(
          fee,
          newAccountId ? true : false
        );
        const { network } = coin;
        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.near.transaction
            .getFees({ network })
            .request();
          feeRate = res.data;
        }

        totalFees = feeRate / 10 ** coin.decimal;
        const txnData = newAccountId
          ? await wallet.generateCreateAccountTransaction(
              newAccountId,
              customAccount
            )
          : await wallet.generateUnsignedTransaction(
              outputList[0].address,
              outputList[0].value,
              isSendAll,
              new BigNumber(feeRate),
              customAccount
            );
        ({ txn: unsignedTransaction, inputs, outputs } = txnData);
      } else {
        wallet = new BitcoinWallet({
          xpub,
          coinType,
          walletId,
          zpub,
          addressDb: addressDB,
          transactionDb: transactionDB
        });

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.bitcoin.transaction
            .getFees({ coinType })
            .request();
          // divide by 1024 to make fees in sat/byte from sat/kilobyte
          feeRate = Math.round(res.data.medium_fee_per_kb / 1024);
        }

        const tempValue = await wallet.generateMetaData(
          outputList,
          feeRate,
          isSendAll
        );
        metaData = tempValue.metaData;
        txnInfo = tempValue;

        const txnData = await wallet.generateUnsignedTransaction(
          outputList,
          feeRate,
          isSendAll
        );

        totalFees = Number(txnData.fee) / coin.multiplier;
        ({ inputs, outputs } = txnData);

        unsignedTransaction = txnData.txn;
        utxoList = txnData.utxoList;
        if (isSendAll) {
          if (txnData.amount) {
            sendMaxAmount = new BigNumber(txnData.amount)
              .dividedBy(new BigNumber(coin.multiplier))
              .toString();
          }
        }
      }

      this.emit('totalFees', totalFees);
      this.emit('inputOutput', { inputs, outputs });

      if (sendMaxAmount && isSendAll) {
        this.emit('sendMaxAmount', sendMaxAmount);
      }

      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        const packetVersion = connection.getPacketVersion();
        if (packetVersion === PacketVersionMap.v3) {
          await this.runOperation({
            ...params,
            utxoList,
            inputs,
            txnInfo,
            wallet,
            unsignedTransaction,
            metaData
          });
        } else {
          await this.runLegacy({
            ...params,
            utxoList,
            inputs,
            txnInfo,
            wallet,
            unsignedTransaction,
            metaData
          });
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

  public async calcApproxFee(
    xpub: string,
    zpub: string | undefined,
    walletId: string,
    coinType: string,
    outputList: Array<{ address: string; value?: BigNumber }>,
    fee: number,
    isSendAll?: boolean,
    data: TransactionSenderRunOptions['data'] = {
      gasLimit: 21000,
      contractAddress: undefined,
      contractAbbr: undefined
    },
    transactionDB?: TransactionDB,
    customAccount?: string
  ) {
    try {
      this.cancelled = false;
      let feeRate;
      let totalFees: string;

      const coin = COINS[coinType];

      if (!coin) {
        throw new Error(`Invalid coinType ${coinType}`);
      }

      if (coin instanceof EthCoinData) {
        const { gasLimit } = data;
        const { network } = coin;

        const wallet = new EthereumWallet(xpub, coin);

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.eth.transaction
            .getFees({ network, responseType: 'v2' })
            .request();
          feeRate = Math.round(res.data.fees / 1000000000);
        }

        const calcData = await wallet.approximateTxnFee(
          outputList[0].value,
          feeRate,
          gasLimit,
          isSendAll,
          data.contractAddress
        );
        totalFees = calcData.fees
          .dividedBy(new BigNumber(coin.multiplier))
          .toString(10);

        const token = data.contractAbbr
          ? coin.tokenList[data.contractAbbr]
          : coin;

        if (!token) {
          throw new Error('Invalid token or coinType');
        }

        if (isSendAll) {
          this.emit(
            'sendMaxAmount',
            calcData.amount
              .dividedBy(new BigNumber(token.multiplier))
              .toString(10)
          );
        }
      } else if (coin instanceof NearCoinData) {
        const { network } = coin;

        const wallet = new NearWallet(xpub, coin);

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet for near.`);
          const res = await Server.near.transaction
            .getFees({ network })
            .request();
          feeRate = Math.round(res);
        }

        const calcData = await wallet.approximateTxnFee(
          outputList[0].value,
          feeRate,
          isSendAll,
          customAccount
        );
        totalFees = calcData.fees
          .dividedBy(new BigNumber(coin.multiplier))
          .toString(10);

        if (isSendAll) {
          this.emit(
            'sendMaxAmount',
            calcData.amount
              .dividedBy(new BigNumber(coin.multiplier))
              .toString(10)
          );
        }
      } else {
        const wallet = new BitcoinWallet({
          xpub,
          coinType,
          walletId,
          zpub,
          transactionDb: transactionDB
        });

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.bitcoin.transaction
            .getFees({ coinType })
            .request();
          // divide by 1024 to make fees in sat/byte from sat/kilobyte
          feeRate = Math.round(res.data.medium_fee_per_kb / 1024);
        }

        const tempValue = await wallet.approximateTxnFee(
          outputList,
          feeRate,
          isSendAll
        );

        if (isSendAll) {
          if (tempValue.outputs && tempValue.outputs.length > 0) {
            this.emit(
              'sendMaxAmount',
              new BigNumber(tempValue.outputs[0].value)
                .dividedBy(new BigNumber(coin.multiplier))
                .toString()
            );
          }
        }

        totalFees = new BigNumber(tempValue.fees)
          .dividedBy(coin.multiplier)
          .toString();
      }

      logger.info('Approximate txn fee', {
        approximateTxnFee: totalFees,
        coin: coinType
      });
      this.emit('approxTotalFee', totalFees);
    } catch (error) {
      throw error;
    }
  }
}
