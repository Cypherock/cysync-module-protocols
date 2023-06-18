import {
  BtcCoinData,
  CoinGroup,
  COINS,
  EthCoinData,
  NearCoinData,
  SolanaCoinData,
  StatusData
} from '@cypherock/communication';
import { AddressDB, TransactionDB } from '@cypherock/database';
import Server from '@cypherock/server-wrapper';
import {
  BitcoinWallet,
  EthereumWallet,
  NearWallet,
  SolanaWallet
} from '@cypherock/wallet';
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
  accountId: string;
  accountIndex: number;
  accountType: string;
  coinId: string;
  customAccount?: string;
  newAccountId?: string;
  outputList: Array<{ address: string; value: BigNumber }>;
  fee: number;
  isSendAll?: boolean;
  data?: {
    gasLimit: number;
    l1Cost?: string;
    contractAddress?: string;
    contractAbbr?: string;
    subCoinId?: string;
    contractData?: string;
    nonce?: string;
  };
}

interface RunParams extends TransactionSenderRunOptions {
  metaData: string;
  unsignedTransaction: string;
  utxoList: string[];
  wallet: BitcoinWallet | EthereumWallet | NearWallet | SolanaWallet;
  txnInfo: any;
  inputs: any[];
}

export enum SEND_TRANSACTION_STATUS {
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

export enum SEND_TRANSACTION_STATUS_ETH {
  SEND_TXN_VERIFY_COIN_ETH = 1,
  SEND_TXN_UNSIGNED_TXN_WAIT_SCREEN_ETH,
  SEND_TXN_UNSIGNED_TXN_RECEIVED_ETH,
  SEND_TXN_VERIFY_CONTRACT_ADDRESS,
  SEND_TXN_VERIFY_BLIND_SIGNING_ETH,
  SEND_TXN_VERIFY_DERIVATION_PATH,
  SEND_TXN_VERIFY_TXN_NONCE_ETH,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_ETH,
  SEND_TXN_CALCULATE_AMOUNT_ETH,
  SEND_TXN_VERIFY_RECEIPT_AMOUNT_ETH,
  SEND_TXN_VERIFY_RECEIPT_FEES_ETH,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_ETH,
  SEND_TXN_DISPLAY_INFO_ETH,
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

export enum SEND_TRANSACTION_STATUS_NEAR {
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
  SEND_TXN_SIGN_TXN_NEAR
}

export enum SEND_TRANSACTION_STATUS_SOLANA {
  SEND_TXN_VERIFY_COIN_SOLANA = 1,
  SEND_TXN_UNSIGNED_TXN_WAIT_SCREEN_SOLANA,
  SEND_TXN_UNSIGNED_TXN_RECEIVED_SOLANA,
  SEND_TXN_VERIFY_CONTRACT_ADDRESS_SOLANA,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_SOLANA,
  SEND_TXN_CALCULATE_AMOUNT_SOLANA,
  SEND_TXN_VERIFY_RECEIPT_AMOUNT_SOLANA,
  SEND_TXN_VERIFY_RECEIPT_FEES_SOLANA,
  SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_SOLANA,
  SEND_TXN_ENTER_PASSPHRASE_SOLANA,
  SEND_TXN_CONFIRM_PASSPHRASE_SOLANA,
  SEND_TXN_CHECK_PIN_SOLANA,
  SEND_TXN_ENTER_PIN_SOLANA,
  SEND_TXN_TAP_CARD_SOLANA,
  SEND_TXN_TAP_CARD_SEND_CMD_SOLANA,
  SEND_TXN_READ_DEVICE_SHARE_SOLANA,
  SEND_TXN_SIGN_TXN_SOLANA,
  SEND_TXN_WAITING_SCREEN_SOLANA,
  SEND_TXN_FINAL_SCREEN_SOLANA
}

export class TransactionSender extends CyFlow {
  constructor() {
    super();
  }

  handleCommand75() {
    logger.info('Wallet is locked');
    this.emit('locked');
    throw new ExitFlowError();
  }

  async runOperation({
    connection,
    walletId,
    pinExists,
    passphraseExists,
    metaData,
    unsignedTransaction,
    utxoList,
    wallet,
    txnInfo,
    inputs,
    coinId
  }: RunParams) {
    const coin = COINS[coinId];

    if (!coin) {
      throw new Error(`Invalid coinId ${coinId}`);
    }

    logger.info('Send data', {
      coin: coinId,
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
    const isSolana = [CoinGroup.Solana].includes(coin.group);

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
      SEND_TRANSACTION_STATUS.SEND_TXN_ENTER_PIN;
    let pinEnteredCmdStatus: number =
      SEND_TRANSACTION_STATUS.SEND_TXN_TAP_CARD_SEND_CMD;
    let cardTapCmdStatus: number =
      SEND_TRANSACTION_STATUS.SEND_TXN_TAP_CARD_SEND_CMD;

    if (isEth) {
      requestAcceptedCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_VERIFY_COIN_ETH;
      recipientVerifiedCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_ENTER_PASSPHRASE_ETH;
      passphraseEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_ENTER_PIN_ETH;
      pinEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_TAP_CARD_SEND_CMD_ETH;
      cardTapCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_TAP_CARD_SEND_CMD_ETH;
    } else if (isNear) {
      requestAcceptedCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_VERIFY_COIN_NEAR;
      recipientVerifiedCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_NEAR;
      passphraseEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_ENTER_PIN_NEAR;
      pinEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_TAP_CARD_SEND_CMD_NEAR;
      cardTapCmdStatus =
        SEND_TRANSACTION_STATUS_NEAR.SEND_TXN_TAP_CARD_SEND_CMD_NEAR;
    } else if (isSolana) {
      requestAcceptedCmdStatus =
        SEND_TRANSACTION_STATUS_SOLANA.SEND_TXN_VERIFY_COIN_SOLANA;
      recipientVerifiedCmdStatus =
        SEND_TRANSACTION_STATUS_SOLANA.SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_SOLANA;
      passphraseEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_SOLANA.SEND_TXN_ENTER_PIN_SOLANA;
      pinEnteredCmdStatus =
        SEND_TRANSACTION_STATUS_SOLANA.SEND_TXN_TAP_CARD_SEND_CMD_SOLANA;
      cardTapCmdStatus =
        SEND_TRANSACTION_STATUS_SOLANA.SEND_TXN_TAP_CARD_SEND_CMD_SOLANA;
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

    if (receivedData.commandType === 75) this.handleCommand75();
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

    if (coin instanceof BtcCoinData) {
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
        expectedCommandTypes: [54, 79, 81, 71, 53, 75],
        onStatus
      });

      if (signedTxn.commandType === 75) this.handleCommand75();

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
        expectedCommandTypes: [54, 79, 81, 71, 53, 91, 75],
        onStatus
      });

      if (signedTxn.commandType === 75) this.handleCommand75();

      if ([79, 91, 53].includes(signedTxn.commandType)) {
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
    } else if (wallet instanceof SolanaWallet) {
      if (!(coin instanceof SolanaCoinData)) {
        throw new Error('Solana Wallet found, but coin is not Solana.');
      }

      const preSignedTxn = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [79, 81, 71, 53, 91, 52, 75],
        onStatus
      });

      if (preSignedTxn.commandType === 75) this.handleCommand75();

      if ([79, 91, 53].includes(preSignedTxn.commandType)) {
        this.emit('coinsConfirmed', false);
        throw new ExitFlowError();
      }

      if (preSignedTxn.commandType === 81) {
        this.emit('noWalletOnCard');
        throw new ExitFlowError();
      }
      if (preSignedTxn.commandType === 71) {
        this.emit('cardError');
        throw new ExitFlowError();
      }

      const latestBlockhash = await wallet.getLatestBlockhashAsHex();
      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 92,
        data: latestBlockhash,
        sequenceNumber
      });
      const signedTxn = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [54, 92],
        onStatus: () => {}
      });

      if ([92].includes(signedTxn.commandType)) {
        this.emit('coinsConfirmed', false);
        throw new ExitFlowError();
      }

      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 42,
        data: '01',
        sequenceNumber
      });

      const signedTxnSolana = wallet.getSignedTransaction(
        unsignedTransaction,
        signedTxn.data,
        latestBlockhash
      );

      try {
        const isVerified = await wallet.verifySignedTxn(signedTxnSolana);
        this.emit('signatureVerify', { isVerified, index: 0 });
      } catch (error) {
        this.emit('signatureVerify', {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxnSolana });
      this.emit('signedTxn', signedTxnSolana);
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
          expectedCommandTypes: [54, 79, 81, 71, 53, 75],
          onStatus
        });

        if (inputSig.commandType === 75) this.handleCommand75();

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
      sdkVersion,
      addressDB,
      transactionDB,
      walletId,
      xpub,
      accountId,
      accountIndex,
      accountType,
      coinId,
      outputList,
      fee,
      isSendAll = false,
      data = {
        gasLimit: 21000,
        l1Cost: '0',
        contractAddress: undefined,
        contractAbbr: undefined,
        contractData: undefined,
        nonce: undefined
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
      let wallet: BitcoinWallet | EthereumWallet | NearWallet | SolanaWallet;
      let totalFees: string;
      let txnInfo: any;
      let inputs: any[];
      let outputs: any[];
      let utxoList: any[] = [];
      let sendMaxAmount: string | null = null;

      const coin = COINS[coinId];

      if (!coin) {
        throw new Error(`Invalid coinId ${coinId}`);
      }

      if (coin instanceof EthCoinData) {
        const token = data.subCoinId
          ? coin.tokenList[data.subCoinId || '']
          : coin;

        if (!token) {
          throw new Error('Invalid token or coinId');
        }

        const {
          gasLimit,
          contractAddress,
          contractAbbr,
          nonce,
          contractData,
          l1Cost
        } = data;
        const { network, chain } = coin;
        wallet = new EthereumWallet(accountIndex, xpub, coin);

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.eth.transaction
            .getFees({ network, responseType: 'v2' })
            .request();
          feeRate = Math.round(res.data.fees / 1000000000);
        }

        metaData = await wallet.generateMetaData(
          sdkVersion,
          contractAddress,
          contractAbbr || coin.abbr,
          outputList[0].address.startsWith('one1')
        );

        let amount: BigNumber;
        let txFee: BigNumber;

        const unsignedResp = await wallet.generateUnsignedTransaction({
          outputAddress: outputList[0].address,
          amount: outputList[0].value,
          gasPrice: feeRate,
          gasLimit,
          chain,
          isSendAll,
          contractAddress,
          contractData,
          nonce,
          l1Cost: l1Cost ?? '0'
        });
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

        totalFees = txFee.dividedBy(new BigNumber(coin.multiplier)).toString();
      } else if (coin instanceof NearCoinData) {
        wallet = new NearWallet(accountIndex, xpub, coin);
        metaData = await wallet.generateMetaData(
          fee,
          sdkVersion,
          newAccountId ? true : false
        );
        const { network } = coin;
        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.near.transaction
            .getFees({ network, responseType: 'v2' })
            .request();
          feeRate = res.data.fees;
        }

        totalFees = new BigNumber(feeRate)
          .dividedBy(10 ** coin.decimal)
          .toString();
        const txnData = newAccountId
          ? await wallet.generateCreateAccountTransaction(
              newAccountId,
              customAccount
            )
          : await wallet.generateUnsignedTransaction({
              address: outputList[0].address,
              amount: outputList[0].value,
              isSendAll,
              transactionFee: new BigNumber(feeRate),
              senderAddressArg: customAccount
            });
        ({ txn: unsignedTransaction, inputs, outputs } = txnData);
      } else if (coin instanceof SolanaCoinData) {
        wallet = new SolanaWallet(accountIndex, accountType, xpub, coin);
        metaData = await wallet.generateMetaData(fee, sdkVersion);
        const { network } = coin;
        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.solana.transaction
            .getFees({ network })
            .request();
          feeRate = res.data.fees;
        }

        totalFees = new BigNumber(feeRate)
          .dividedBy(10 ** coin.decimal)
          .toString();
        const txnData = await wallet.generateUnsignedTransaction({
          address: outputList[0].address,
          amount: outputList[0].value,
          isSendAll,
          transactionFee: new BigNumber(feeRate)
        });
        ({ txn: unsignedTransaction, inputs, outputs } = txnData);
      } else {
        wallet = new BitcoinWallet({
          xpub,
          coinId,
          accountId,
          accountIndex,
          accountType,
          walletId,
          addressDb: addressDB,
          transactionDb: transactionDB
        });

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.bitcoin.transaction
            .getFees({ coinType: coin.abbr })
            .request();
          // divide by 1024 to make fees in sat/byte from sat/kilobyte
          feeRate = Math.round(res.data.medium_fee_per_kb / 1024);
        }

        const tempValue = await wallet.generateMetaData(
          outputList,
          feeRate,
          sdkVersion,
          isSendAll
        );
        metaData = tempValue.metaData;
        txnInfo = tempValue;

        const txnData = await wallet.generateUnsignedTransaction({
          outputList,
          feeRate,
          isSendAll
        });

        totalFees = new BigNumber(txnData.fee)
          .dividedBy(coin.multiplier)
          .toString();
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

  public async calcApproxFee(params: {
    xpub: string;
    accountId: string;
    accountIndex: number;
    accountType?: string;
    coinId: string;
    walletId: string;
    outputList: Array<{ address: string; value?: BigNumber }>;
    fee: number;
    isSendAll?: boolean;
    data?: TransactionSenderRunOptions['data'];
    transactionDB?: TransactionDB;
    customAccount?: string;
  }) {
    try {
      const {
        xpub,
        accountId,
        accountIndex,
        accountType,
        coinId,
        walletId,
        outputList,
        fee,
        isSendAll,
        data = {
          gasLimit: 21000,
          l1Cost: '0',
          contractAddress: undefined,
          contractAbbr: undefined,
          subCoinId: undefined
        },
        transactionDB,
        customAccount
      } = params;
      this.cancelled = false;
      let feeRate;
      let totalFees: string;

      const coin = COINS[coinId];

      if (!coin) {
        throw new Error(`Invalid coinId ${coinId}`);
      }

      if (coin instanceof EthCoinData) {
        const { gasLimit } = data;
        const { network } = coin;

        const wallet = new EthereumWallet(accountIndex, xpub, coin);

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
          data.contractAddress,
          data.l1Cost
        );
        totalFees = calcData.fees
          .dividedBy(new BigNumber(coin.multiplier))
          .toString(10);

        const token = data.subCoinId
          ? coin.tokenList[data.subCoinId || '']
          : coin;

        if (!token) {
          throw new Error('Invalid token or coinId');
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

        const wallet = new NearWallet(accountIndex, xpub, coin);

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet for near.`);
          const res = await Server.near.transaction
            .getFees({ network, responseType: 'v2' })
            .request();
          feeRate = res.data.fees;
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
      } else if (coin instanceof SolanaCoinData) {
        const { network } = coin;

        const wallet = new SolanaWallet(
          accountIndex,
          accountType || '',
          xpub,
          coin
        );

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet for solana.`);
          const res = await Server.solana.transaction
            .getFees({ network })
            .request();
          feeRate = res.data.fees;
        }

        const calcData = await wallet.approximateTxnFee(
          outputList[0].value,
          feeRate,
          isSendAll
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
          accountId,
          accountIndex,
          accountType,
          coinId,
          walletId,
          transactionDb: transactionDB
        });

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.bitcoin.transaction
            .getFees({ coinType: coin.abbr })
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
        coin: coinId
      });
      this.emit('approxTotalFee', totalFees);
    } catch (error) {
      throw error;
    }
  }
}
