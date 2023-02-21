import {
  BtcCoinData,
  CoinGroup,
  COINS,
  EthCoinData,
  NearCoinData,
  SolanaCoinData,
  StatusData
} from '@cypherock/communication';
import Server from '@cypherock/server-wrapper';
import newWallet, {
  BitcoinWallet,
  EthereumWallet,
  NearWallet,
  SolanaWallet
} from '@cypherock/wallet';
import BigNumber from 'bignumber.js';

import { commandHandler76 } from '../../handlers';
import { bytesToHex, logger, stringToUTF8Bytes } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';
import {
  RECEIVE_TRANSACTION_STATUS,
  RECEIVE_TRANSACTION_STATUS_ETH,
  RECEIVE_TRANSACTION_STATUS_NEAR,
  RECEIVE_TRANSACTION_STATUS_SOLANA,
  TransactionReceiverRunOptions
} from '../receiveTransaction';
import {
  SEND_TRANSACTION_STATUS,
  SEND_TRANSACTION_STATUS_ETH,
  SEND_TRANSACTION_STATUS_NEAR,
  SEND_TRANSACTION_STATUS_SOLANA
} from '../sendTransaction';
import { TransactionSenderRunOptions } from '../sendTransaction';

export interface TransactionSwapperRunOptions extends CyFlowRunOptions {
  sendAmount: string;
  receiveAmount: string;
  changellyFee: string;
  transactionReceiverRunOptions: TransactionReceiverRunOptions;
  transactionSenderRunOptions: TransactionSenderRunOptions;
  deviceSerialId: string;
}

export enum SWAP_TRANSACTION_EVENTS {
  CONNECTION_OPEN = 'connectionOpen',
  CONNECTION_CLOSE = 'connectionClose',
  ERROR = 'error',
  NOT_READY = 'notReady',
  LOCKED = 'locked',
  RECEIVE_ADDRESS = 'receiveAddress',
  SWAP_TRANSACTION_METADATA_SENT = 'swapTransactionMetadataSent',
  RECEIVE_FLOW_CUSTOM_ACCOUNT_EXISTS = 'receiveFlowCustomAccountExists',
  NO_RECEIVE_WALLET_ON_CARD = 'noReceiveWalletOnCard',
  NO_RECEIVE_WALLET_FOUND = 'noReceiveWalletFound',
  RECEIVE_COINS_CONFIRMED = 'receiveCoinsConfirmed',
  RECEIVE_WALLET_LOCKED = 'receiveWalletLocked',
  RECEIVE_FLOW_CARD_ERROR = 'receiveFlowCardError',
  RECEIVE_ADDRESS_VERIFIED = 'receiveAddressVerified',
  RECEIVE_FLOW_PASSPHRASE_ENTERED = 'receiveFlowPassphraseEntered',
  RECEIVE_FLOW_COINS_CONFIRMED = 'coinsConfirmed',
  RECEIVE_FLOW_PIN_ENTERED = 'pinEntered',
  RECEIVE_FLOW_CARD_TAPPED = 'cardTapped',
  CHANGELLY_ADDRESS = 'changellyAddress',
  CHANGELLY_ID = 'changellyId',
  SEND_WALLET_LOCKED = 'sendWalletLocked',
  SEND_FLOW_CARD_ERROR = 'sendFlowCardError',
  NO_SEND_WALLET_ON_CARD = 'noSendWalletOnCard',
  NO_SEND_WALLET_FOUND = 'noSendWalletFound',
  SEND_COINS_CONFIRMED = 'sendCoinsConfirmed',
  SIGNATURE_VERIFY = 'signatureVerify',
  SIGNED_TRANSACTION = 'signedTransaction',
  SEND_FLOW_VERIFIED = 'sendFlowVerified',
  SEND_FLOW_PASSPHRASE_ENTERED = 'sendFlowPassphraseEntered',
  SEND_FLOW_PIN_ENTERED = 'sendFlowPinEntered',
  SEND_FLOW_CARD_TAPPED = 'sendFlowCardTapped',
  TRANSACTION_TOO_LARGE = 'transactionTooLarge',
  INSUFFICIENT_FUNDS = 'insufficientFunds'
}

interface RunParams extends TransactionSwapperRunOptions {
  receiveAddress: string;
  receiveAddressPath: string;
}

/**
 *  Creates a swap transaction between `fromToken` and `toToken` for an amount
 *
 * @param walletId The wallet to use for the swap
 * @returns The transaction ID to later check the status of the swap and the
 * payment address to send the tokens to.
 */
const createSwapTransaction = async (
  walletId: string,
  from: string,
  to: string,
  amount: string,
  address: string,
  serial: string
) => {
  await Server.session.createSession({deviceSerial: serial}).request();

  const { data } = await Server.swap
    .createTransaction({
      walletId,
      from,
      to,
      amount,
      address,
      serial
    })
    .request();

  return {
    id: data.message.id,
    payinAddress: data.message.payinAddress,
    signature: data.message.signature,
    sessionId: data.message.sessionId,
  };
};

export class TransactionSwapper extends CyFlow {
  constructor() {
    super();
  }

  handleCommand75() {
    logger.info('Wallet is locked');
    this.emit(SWAP_TRANSACTION_EVENTS.LOCKED);
    throw new ExitFlowError();
  }

  async runOperation({
    sdkVersion,
    connection,
    sendAmount,
    receiveAmount,
    changellyFee,
    transactionReceiverRunOptions,
    transactionSenderRunOptions,
    receiveAddress,
    receiveAddressPath,
    deviceSerialId
  }: RunParams) {

    const receiveCoin = COINS[transactionReceiverRunOptions.coinId];

    if (!receiveCoin) {
      throw new Error('Invalid receive coin type');
    }

    const sendCoin = COINS[transactionSenderRunOptions.coinId];

    if (!sendCoin) {
      throw new Error('Invalid send coin type');
    }

    let unsignedTransaction = '';
    let metaData = '';
    let feeRate;
    let sendWallet: BitcoinWallet | EthereumWallet | NearWallet | SolanaWallet;
    let totalFees: string = '';
    let txnInfo: any;
    let inputs: any[] = [];
    let outputs: any[] = [];
    let utxoList: any[] = [];
    let sendMaxAmount: string | null = null;

    // determine metadata
    if (sendCoin instanceof EthCoinData) {
      const token = transactionSenderRunOptions.data?.subCoinId
        ? sendCoin.tokenList[transactionSenderRunOptions.data?.subCoinId || '']
        : sendCoin;

      if (!token) {
        throw new Error('Invalid token or coinId');
      }
      const { contractAddress, contractAbbr } =
        transactionSenderRunOptions.data || {
          gasLimit: 21000,
          contractAddress: undefined,
          contractAbbr: undefined
        };
      
      const { network } = sendCoin;
      sendWallet = new EthereumWallet(
        transactionSenderRunOptions.accountIndex,
        transactionSenderRunOptions.xpub,
        sendCoin
      );

      // if (transactionSenderRunOptions.fee) {
      //   feeRate = transactionSenderRunOptions.fee;
      // } else {
        logger.info(`Fetching optimal fees from the internet.`);
        const res = await Server.eth.transaction
          .getFees({ network, responseType: 'v2' })
          .request();
        feeRate = Math.round(res.data.fees / 1000000000);
      // }

      metaData = await sendWallet.generateMetaData(
        sdkVersion,
        contractAddress,
        contractAbbr || sendCoin.abbr,
        false
      );
    } else if (sendCoin instanceof NearCoinData) {
      sendWallet = new NearWallet(
        transactionSenderRunOptions.accountIndex,
        transactionSenderRunOptions.xpub,
        sendCoin
      );
      metaData = await sendWallet.generateMetaData(
        transactionSenderRunOptions.fee,
        sdkVersion,
        transactionSenderRunOptions.newAccountId ? true : false
      );
    } else if (sendCoin instanceof SolanaCoinData) {
      sendWallet = new SolanaWallet(
        transactionSenderRunOptions.accountIndex,
        transactionSenderRunOptions.accountType,
        transactionSenderRunOptions.xpub,
        sendCoin
      );
      metaData = await sendWallet.generateMetaData(
        transactionSenderRunOptions.fee,
        sdkVersion
      );
    } else {
      sendWallet = new BitcoinWallet({
        xpub: transactionSenderRunOptions.xpub,
        coinId: transactionSenderRunOptions.coinId,
        accountId: transactionSenderRunOptions.accountId,
        accountIndex: transactionSenderRunOptions.accountIndex,
        walletId: transactionSenderRunOptions.walletId,
        addressDb: transactionSenderRunOptions.addressDB,
        transactionDb: transactionSenderRunOptions.transactionDB
      });

        logger.info(`Fetching optimal fees from the internet.`);
        const res = await Server.bitcoin.transaction
          .getFees({ coinType: sendCoin.abbr })
          .request();
        // divide by 1024 to make fees in sat/byte from sat/kilobyte
        feeRate = Math.round(res.data.medium_fee_per_kb / 1024);


      const tempValue = await sendWallet.generateMetaData(
        transactionSenderRunOptions.outputList,
        feeRate,
        sdkVersion,
        transactionSenderRunOptions.isSendAll
      );
      metaData = tempValue.metaData;
    }

    logger.info('SwapTransaction: Receive addr data', {
      coin: transactionReceiverRunOptions.coinId,
      receiveAddress,
      receiveAddressPath,
      walletId: transactionReceiverRunOptions.walletId
    });

    const sendAmountHex =
      bytesToHex(stringToUTF8Bytes(parseFloat(sendAmount).toFixed(4))) + '00';
    const receiveAmountHex =
      bytesToHex(stringToUTF8Bytes(parseFloat(receiveAmount).toFixed(4))) +
      '00';
    const changellyFeeHex =
      bytesToHex(stringToUTF8Bytes(parseFloat(changellyFee).toFixed(4))) + '00';

    const data =
      sendAmountHex +
      receiveAmountHex +
      changellyFeeHex +
      transactionSenderRunOptions.walletId +
      metaData +
      transactionReceiverRunOptions.walletId +
      receiveAddressPath;

    let sequenceNumber = connection.getNewSequenceNumber();

    await connection.sendCommand({
      commandType: 66,
      data,
      sequenceNumber
    });

    this.emit(SWAP_TRANSACTION_EVENTS.SWAP_TRANSACTION_METADATA_SENT);

    let requestAcceptedState = 0;
    let passphraseEnteredState = 0;
    let pinEnteredState = 0;
    let cardTapState = 0;
    let nearAccountDerivingState = 0;

    this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_ADDRESS, receiveAddress);

    const isEth = [CoinGroup.Ethereum, CoinGroup.Ethereum].includes(
      receiveCoin.group
    );
    const isNear = [CoinGroup.Near].includes(receiveCoin.group);
    const isSolana = [CoinGroup.Solana].includes(receiveCoin.group);

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

    const onStatus = (status: StatusData) => {
      if (
        status.flowStatus >= requestAcceptedCmdStatus &&
        requestAcceptedState === 0
      ) {
        requestAcceptedState = 1;
      }
      if (
        transactionReceiverRunOptions.passphraseExists &&
        status.flowStatus >= passphraseEnteredCmdStatus &&
        passphraseEnteredState === 0
      ) {
        passphraseEnteredState = 1;
      }

      if (
        transactionReceiverRunOptions.pinExists &&
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
        this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_FLOW_COINS_CONFIRMED, true);
      }

      if (passphraseEnteredState === 1) {
        passphraseEnteredState = 2;
        this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_FLOW_PASSPHRASE_ENTERED);
      }

      if (pinEnteredState === 1) {
        pinEnteredState = 2;
        this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_FLOW_PIN_ENTERED, true);
      }

      if (cardTapState === 1) {
        cardTapState = 2;
        this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_FLOW_CARD_TAPPED);
      }
    };

    const signedSwapAddressVerified = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [67, 75, 76, 64, 65, 63, 71, 81, 91, 79],
      onStatus: status => {
        onStatus(status);
        // receive 65 before this status is handled for custom account exists case
        if (
          status.flowStatus >= derivingAddressCmdStatus &&
          nearAccountDerivingState === 0
        ) {
          nearAccountDerivingState = 1;
        }
        if (
          nearAccountDerivingState === 1 &&
          transactionReceiverRunOptions.customAccount
        ) {
          nearAccountDerivingState = 2;
          this.emit(
            SWAP_TRANSACTION_EVENTS.RECEIVE_FLOW_CUSTOM_ACCOUNT_EXISTS,
            true
          );
        }
      }
    });

    if (signedSwapAddressVerified.commandType === 75) {
      this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_WALLET_LOCKED);
      throw new ExitFlowError();
    }

    if (signedSwapAddressVerified.commandType === 76) {
      commandHandler76(signedSwapAddressVerified, this);
    }

    if ([79, 91, 63].includes(signedSwapAddressVerified.commandType)) {
      this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_COINS_CONFIRMED, false);
      throw new ExitFlowError();
    }

    if (signedSwapAddressVerified.commandType === 81) {
      this.emit(SWAP_TRANSACTION_EVENTS.NO_RECEIVE_WALLET_ON_CARD);
      throw new ExitFlowError();
    }
    if (signedSwapAddressVerified.commandType === 71) {
      this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_FLOW_CARD_ERROR);
      throw new ExitFlowError();
    }

    if (signedSwapAddressVerified.commandType !== 67) {
      throw new Error('Invalid command');
    }

    let addressVerified = false;

    if (signedSwapAddressVerified.data) {
      const addressLength =
        signedSwapAddressVerified.data.length - 64 - 128 - 14 - 46;
      const addressHex = signedSwapAddressVerified.data.slice(0, addressLength);
      const deviceSerial = signedSwapAddressVerified.data.slice(
        addressLength,
        addressLength + 64
      );
      const signature = signedSwapAddressVerified.data.slice(
        addressLength + 64,
        addressLength + 64 + 128
      );
      const postfix1 = signedSwapAddressVerified.data.slice(
        addressLength + 64 + 128,
        addressLength + 64 + 128 + 14
      );
      const postfix2 = signedSwapAddressVerified.data.slice(
        addressLength + 64 + 128 + 14,
        addressLength + 64 + 128 + 14 + 46
      );

      const verificationResponse = await Server.swap
        .verifyAddress({
          address: addressHex,
          serial: deviceSerial,
          signature,
          postfix1,
          postfix2
        })
        .request();

      if (verificationResponse.data.status !== 1 || !verificationResponse.data.verified) {
        throw new Error('Address verification failed');
      }

      addressVerified = verificationResponse.data.verified;

      let address = '';

      if (receiveCoin instanceof EthCoinData) {
        address = `0x${addressHex.toLowerCase()}`;
      } else if (receiveCoin instanceof NearCoinData) {
        address = transactionReceiverRunOptions.customAccount || addressHex;
      } else if (receiveCoin instanceof SolanaCoinData) {
        // Remove trailing null characters from address
        address = Buffer.from(addressHex, 'hex')
          .toString()
          .replace(/^[\s\uFEFF\xA0\0]+|[\s\uFEFF\xA0\0]+$/g, '');
      } else {
        address = Buffer.from(addressHex, 'hex').toString().toLowerCase();
      }

      this.emit(SWAP_TRANSACTION_EVENTS.RECEIVE_ADDRESS_VERIFIED, address);
    }

    const swapTransactionDetails = await createSwapTransaction(
      transactionReceiverRunOptions.walletId,
      COINS[transactionSenderRunOptions.coinId].abbr,
      COINS[transactionReceiverRunOptions.coinId].abbr,
      sendAmount,
      receiveAddress,
      deviceSerialId
    );

    console.table({
      swapTransactionDetails
    });

    const changellyAddress = swapTransactionDetails.payinAddress;
    // const changellyAddress = "0x773808a1f19952d5af533b7ad788dbec5b153ad3";
    const sessionId = swapTransactionDetails.sessionId;
    const signature = swapTransactionDetails.signature;



        // TODO: CREATE PAYLOAD AND SIGN
    const receiveAddressVerificationPayload = sessionId + changellyAddress.slice(2) + signature;

    logger.info(
      "SwapTransactionSender: receive address verification: ", {sessionId, changellyAddress, signature});
    
    sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 68,
      data: receiveAddressVerificationPayload,
      sequenceNumber
    });

    const receiveAddressVerified = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [69],
      onStatus: () => {
      }
    });

    this.emit(SWAP_TRANSACTION_EVENTS.CHANGELLY_ADDRESS, changellyAddress);
    this.emit(SWAP_TRANSACTION_EVENTS.CHANGELLY_ID, swapTransactionDetails.id);

    sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 50,
      data: addressVerified ? '01' : '00',
      sequenceNumber
    });

    if (
      sendCoin instanceof EthCoinData &&
      sendWallet instanceof EthereumWallet
    ) {
      const token = transactionSenderRunOptions.data?.subCoinId
        ? sendCoin.tokenList[transactionSenderRunOptions.data?.subCoinId || '']
        : sendCoin;

      if (!token) {
        throw new Error('Invalid token or coinId');
      }

      const { gasLimit, contractAddress } =
        transactionSenderRunOptions.data || {
          gasLimit: 21000,
          contractAddress: undefined,
          contractAbbr: undefined
        };
      const { network, chain } = sendCoin;
      sendWallet = new EthereumWallet(
        transactionSenderRunOptions.accountIndex,
        transactionSenderRunOptions.xpub,
        sendCoin
      );


        logger.info(`Fetching optimal fees from the internet.`);
        const res = await Server.eth.transaction
          .getFees({ network, responseType: 'v2' })
          .request();
        feeRate = Math.round(res.data.fees / 1000000000);

      let amount: BigNumber;
      let txFee: BigNumber;

      const unsignedResp = await sendWallet.generateUnsignedTransaction(
        changellyAddress,
        transactionSenderRunOptions.outputList[0].value,
        feeRate,
        gasLimit,
        chain,
        transactionSenderRunOptions.isSendAll || false,
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

      totalFees = txFee
        .dividedBy(new BigNumber(sendCoin.multiplier))
        .toString();
    } else if (
      sendCoin instanceof NearCoinData &&
      sendWallet instanceof NearWallet
    ) {
      const { network } = sendCoin;
        logger.info(`Fetching optimal fees from the internet.`);
        const res = await Server.near.transaction
          .getFees({ network, responseType: 'v2' })
          .request();
        feeRate = res.data.fees;

      totalFees = new BigNumber(feeRate)
        .dividedBy(10 ** sendCoin.decimal)
        .toString();
      const txnData = transactionSenderRunOptions.newAccountId
        ? await sendWallet.generateCreateAccountTransaction(
            transactionSenderRunOptions.newAccountId,
            transactionSenderRunOptions.customAccount
          )
        : await sendWallet.generateUnsignedTransaction(
            changellyAddress,
            transactionSenderRunOptions.outputList[0].value,
            transactionSenderRunOptions.isSendAll || false,
            new BigNumber(feeRate),
            transactionSenderRunOptions.customAccount
          );
      ({ txn: unsignedTransaction, inputs, outputs } = txnData);
    } else if (
      sendCoin instanceof SolanaCoinData &&
      sendWallet instanceof SolanaWallet
    ) {
      const { network } = sendCoin;
        logger.info(`Fetching optimal fees from the internet.`);
        const res = await Server.solana.transaction
          .getFees({ network })
          .request();
        feeRate = res.data.fees;
   

      totalFees = new BigNumber(feeRate)
        .dividedBy(10 ** sendCoin.decimal)
        .toString();
      const txnData = await sendWallet.generateUnsignedTransaction(
        changellyAddress,
        transactionSenderRunOptions.outputList[0].value,
        transactionSenderRunOptions.isSendAll || false,
        new BigNumber(feeRate)
      );
      ({ txn: unsignedTransaction, inputs, outputs } = txnData);
    } else if (sendWallet instanceof BitcoinWallet) {

        logger.info(`Fetching optimal fees from the internet.`);
        const res = await Server.bitcoin.transaction
          .getFees({ coinType: sendCoin.abbr })
          .request();
        // divide by 1024 to make fees in sat/byte from sat/kilobyte
        feeRate = Math.round(res.data.medium_fee_per_kb / 1024);

      const tempValue = await sendWallet.generateMetaData(
        transactionSenderRunOptions.outputList,
        feeRate,
        sdkVersion,
        transactionSenderRunOptions.isSendAll
      );

      metaData = tempValue.metaData;
      txnInfo = tempValue;

      const txnData = await sendWallet.generateUnsignedTransaction(
        transactionSenderRunOptions.outputList,
        feeRate,
        transactionSenderRunOptions.isSendAll
      );

      totalFees = new BigNumber(txnData.fee)
        .dividedBy(sendCoin.multiplier)
        .toString();
      ({ inputs, outputs } = txnData);

      unsignedTransaction = txnData.txn;
      utxoList = txnData.utxoList;
      if (transactionSenderRunOptions.isSendAll) {
        if (txnData.amount) {
          sendMaxAmount = new BigNumber(txnData.amount)
            .dividedBy(new BigNumber(sendCoin.multiplier))
            .toString();
        }
      }
    }

    this.emit('totalFees', totalFees);
    this.emit('inputOutput', { inputs, outputs });

    if (sendMaxAmount && transactionSenderRunOptions.isSendAll) {
      this.emit('sendMaxAmount', sendMaxAmount);
    }

    logger.info('SwapTransaction: Send data', {
      coin: transactionSenderRunOptions.coinId,
      metaData,
      unsignedTransaction
    });

    let recipientVerifiedState = 0;

    let recipientVerifiedCmdStatus: number =
      SEND_TRANSACTION_STATUS.SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD;

    if (isEth) {
      requestAcceptedCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_VERIFY_COIN_ETH;
      recipientVerifiedCmdStatus =
        SEND_TRANSACTION_STATUS_ETH.SEND_TXN_VERIFY_RECEIPT_ADDRESS_SEND_CMD_ETH;
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

    const onStatusSend = (status: StatusData) => {
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
        transactionSenderRunOptions.passphraseExists &&
        status.flowStatus >= passphraseEnteredCmdStatus &&
        passphraseEnteredState === 0
      ) {
        passphraseEnteredState = 1;
      }

      if (
        transactionSenderRunOptions.pinExists &&
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
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_COINS_CONFIRMED, true);
      }

      if (recipientVerifiedState === 1) {
        recipientVerifiedState = 2;
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_FLOW_VERIFIED, true);
      }

      if (passphraseEnteredState === 1) {
        passphraseEnteredState = 2;
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_FLOW_PASSPHRASE_ENTERED);
      }

      if (pinEnteredState === 1) {
        pinEnteredState = 2;
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_FLOW_PIN_ENTERED, true);
      }

      if (cardTapState === 1) {
        cardTapState = 2;
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_FLOW_CARD_TAPPED, true);
      }
    };

    const receivedData = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [75, 76, 51],
      onStatus: onStatusSend
    });

    if (receivedData.commandType === 75) this.handleCommand75();
    if (receivedData.commandType === 76) {
      commandHandler76(receivedData, this);
    }

    const coinsConfirmed = receivedData.data.slice(0, 2);
    const acceptableTxnSize = parseInt(receivedData.data.slice(2), 16) * 2;
    logger.info('Acceptable Txn size', { acceptableTxnSize });

    if (acceptableTxnSize < unsignedTransaction.length) {
      this.emit(SWAP_TRANSACTION_EVENTS.TRANSACTION_TOO_LARGE);
      this.flowInterupted = true;
      throw new ExitFlowError();
    }

    if (coinsConfirmed === '00') {
      this.emit(SWAP_TRANSACTION_EVENTS.SEND_COINS_CONFIRMED, false);
      throw new ExitFlowError();
    }
    this.emit(SWAP_TRANSACTION_EVENTS.SEND_COINS_CONFIRMED, true);

    if (unsignedTransaction === '') {
      logger.info('Insufficient funds.');
      this.emit(SWAP_TRANSACTION_EVENTS.INSUFFICIENT_FUNDS, true);
      this.flowInterupted = true;
      throw new ExitFlowError();
    }

    sequenceNumber = connection.getNewSequenceNumber();

    await connection.sendCommand({
      commandType: 52,
      data: unsignedTransaction,
      sequenceNumber
    });

    if (sendCoin instanceof BtcCoinData) {
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

    if (sendWallet instanceof EthereumWallet) {
      if (!(sendCoin instanceof EthCoinData)) {
        throw new Error('ETH Wallet found, but coin is not ETH.');
      }

      const signedTxn = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [54, 79, 81, 71, 53, 75],
        onStatus
      });

      if (signedTxn.commandType === 75) this.handleCommand75();

      if (signedTxn.commandType === 79 || signedTxn.commandType === 53) {
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_COINS_CONFIRMED, false);
        throw new ExitFlowError();
      }
      if (signedTxn.commandType === 81) {
        this.emit(SWAP_TRANSACTION_EVENTS.NO_SEND_WALLET_ON_CARD);
        throw new ExitFlowError();
      }
      if (signedTxn.commandType === 71) {
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_FLOW_CARD_ERROR);
        throw new ExitFlowError();
      }

      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 42,
        data: '01',
        sequenceNumber
      });

      const signedTxnEth = sendWallet.getSignedTransaction(
        unsignedTransaction,
        signedTxn.data,
        sendCoin.chain
      );

      try {
        const isVerified = await sendWallet.verifySignedTxn(signedTxnEth);
        this.emit(SWAP_TRANSACTION_EVENTS.SIGNATURE_VERIFY, {
          isVerified,
          index: 0
        });
      } catch (error) {
        this.emit(SWAP_TRANSACTION_EVENTS.SIGNATURE_VERIFY, {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxnEth });
      this.emit(SWAP_TRANSACTION_EVENTS.SIGNED_TRANSACTION, signedTxnEth);
    } else if (sendWallet instanceof NearWallet) {
      if (!(sendCoin instanceof NearCoinData)) {
        throw new Error('Near Wallet found, but coin is not Near.');
      }

      const signedTxn = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [54, 79, 81, 71, 53, 91, 75],
        onStatus
      });

      if (signedTxn.commandType === 75) this.handleCommand75();

      if ([79, 91, 53].includes(signedTxn.commandType)) {
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_COINS_CONFIRMED, false);
        throw new ExitFlowError();
      }

      if (signedTxn.commandType === 81) {
        this.emit(SWAP_TRANSACTION_EVENTS.NO_SEND_WALLET_ON_CARD);
        throw new ExitFlowError();
      }
      if (signedTxn.commandType === 71) {
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_FLOW_CARD_ERROR);
        throw new ExitFlowError();
      }

      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 42,
        data: '01',
        sequenceNumber
      });

      const signedTxnNear = sendWallet.getSignedTransaction(
        unsignedTransaction,
        signedTxn.data
      );

      try {
        const isVerified = await sendWallet.verifySignedTxn(signedTxnNear);
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
    } else if (sendWallet instanceof SolanaWallet) {
      if (!(sendCoin instanceof SolanaCoinData)) {
        throw new Error('Solana Wallet found, but coin is not Solana.');
      }

      const preSignedTxn = await connection.waitForCommandOutput({
        sequenceNumber,
        expectedCommandTypes: [79, 81, 71, 53, 91, 52, 75],
        onStatus
      });

      if (preSignedTxn.commandType === 75) this.handleCommand75();

      if ([79, 91, 53].includes(preSignedTxn.commandType)) {
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_COINS_CONFIRMED, false);
        throw new ExitFlowError();
      }

      if (preSignedTxn.commandType === 81) {
        this.emit(SWAP_TRANSACTION_EVENTS.NO_SEND_WALLET_ON_CARD);
        throw new ExitFlowError();
      }
      if (preSignedTxn.commandType === 71) {
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_FLOW_CARD_ERROR);
        throw new ExitFlowError();
      }

      const latestBlockhash = await sendWallet.getLatestBlockhashAsHex();
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
        this.emit(SWAP_TRANSACTION_EVENTS.SEND_COINS_CONFIRMED, false);
        throw new ExitFlowError();
      }

      sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 42,
        data: '01',
        sequenceNumber
      });

      const signedTxnSolana = sendWallet.getSignedTransaction(
        unsignedTransaction,
        signedTxn.data,
        latestBlockhash
      );

      try {
        const isVerified = await sendWallet.verifySignedTxn(signedTxnSolana);
        this.emit(SWAP_TRANSACTION_EVENTS.SIGNATURE_VERIFY, {
          isVerified,
          index: 0
        });
      } catch (error) {
        this.emit(SWAP_TRANSACTION_EVENTS.SIGNATURE_VERIFY, {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxnSolana });
      this.emit(SWAP_TRANSACTION_EVENTS.SIGNED_TRANSACTION, signedTxnSolana);
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
          this.emit(SWAP_TRANSACTION_EVENTS.SEND_COINS_CONFIRMED, false);
          throw new ExitFlowError();
        }
        if (inputSig.commandType === 81) {
          this.emit(SWAP_TRANSACTION_EVENTS.NO_SEND_WALLET_ON_CARD);
          throw new ExitFlowError();
        }
        if (inputSig.commandType === 71) {
          this.emit(SWAP_TRANSACTION_EVENTS.SEND_FLOW_CARD_ERROR);
          throw new ExitFlowError();
        }

        inputSignatures.push(inputSig.data);
      }

      const signedTxn = sendWallet.getSignedTransaction(
        unsignedTransaction,
        inputSignatures
      );

      try {
        const { isVerified, index } = await sendWallet.verifySignedTxn(
          signedTxn,
          inputs
        );
        this.emit(SWAP_TRANSACTION_EVENTS.SIGNATURE_VERIFY, {
          isVerified,
          index
        });
      } catch (error) {
        this.emit(SWAP_TRANSACTION_EVENTS.SIGNATURE_VERIFY, {
          isVerified: false,
          index: -1,
          error
        });
      }

      logger.info('Signed txn', { signedTxn });
      this.emit(SWAP_TRANSACTION_EVENTS.SIGNED_TRANSACTION, signedTxn);
    }
  }

  async run(params: TransactionSwapperRunOptions) {
    const {
      connection,
      sdkVersion,
      transactionReceiverRunOptions,
      transactionSenderRunOptions,
      deviceSerialId
    } = params;

    let flowInterrupted = false;

    try {
      this.cancelled = false;

      // Receive Flow Details
      let receiveAddress = '';
      let receiveAddressPath = '';
      let receiveWallet: any;

      // Send Flow Details
      const receiveCoin = COINS[transactionReceiverRunOptions.coinId];
      const sendCoin = COINS[transactionSenderRunOptions.coinId];

      if (!receiveCoin) {
        throw new Error(
          `Invalid receive coin type ${transactionReceiverRunOptions.coinId}`
        );
      }

      if (!sendCoin) {
        throw new Error(
          `Invalid receive coin type ${transactionSenderRunOptions.coinId}`
        );
      }

      // determine receive address
      if (receiveCoin instanceof EthCoinData) {
        receiveWallet = newWallet({
          coinId: transactionReceiverRunOptions.coinId,
          accountId: transactionReceiverRunOptions.accountId,
          accountIndex: transactionReceiverRunOptions.accountIndex,
          xpub: transactionReceiverRunOptions.xpub,
          walletId: transactionReceiverRunOptions.walletId,
          addressDB: transactionReceiverRunOptions.addressDB
        });
        receiveAddress = receiveWallet.newReceiveAddress().toLowerCase();
        receiveAddressPath = await receiveWallet.getDerivationPath(
          sdkVersion,
          transactionReceiverRunOptions.contractAbbr
        );
      } else if (
        receiveCoin instanceof NearCoinData &&
        transactionReceiverRunOptions.customAccount
      ) {
        receiveWallet = newWallet({
          coinId: transactionReceiverRunOptions.coinId,
          accountId: transactionReceiverRunOptions.accountId,
          accountIndex: transactionReceiverRunOptions.accountIndex,
          xpub: transactionReceiverRunOptions.xpub,
          walletId: transactionReceiverRunOptions.walletId,
          addressDB: transactionReceiverRunOptions.addressDB
        });
        receiveAddress = transactionReceiverRunOptions.customAccount;
        receiveAddressPath =
          await receiveWallet.getDerivationPathForCustomAccount(
            transactionReceiverRunOptions.customAccount,
            sdkVersion
          );
      } else {
        receiveWallet = newWallet({
          coinId: transactionReceiverRunOptions.coinId,
          accountId: transactionReceiverRunOptions.accountId,
          accountIndex: transactionReceiverRunOptions.accountIndex,
          xpub: transactionReceiverRunOptions.xpub,
          walletId: transactionReceiverRunOptions.walletId,
          addressDB: transactionReceiverRunOptions.addressDB
        });
        receiveAddress = await receiveWallet.newReceiveAddress();
        receiveAddressPath = await receiveWallet.getDerivationPath(
          sdkVersion,
          receiveAddress
        );
      }

      // starting the connection
      await this.onStart(connection);

      // wait for device to be ready
      const ready = await this.deviceReady(connection);

      // if ready perform runOperation
      if (ready) {
        await this.runOperation({
          ...params,
          receiveAddress,
          receiveAddressPath,
          deviceSerialId
        });
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      if (!(e instanceof ExitFlowError)) {
        flowInterrupted = true;
        this.emit('error', e);
      }
    } finally {
      await this.onEnd(connection, {
        dontAbort: !flowInterrupted
      });
    }
  }
}
