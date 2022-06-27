import {
  ALLCOINS,
  COINS,
  EthCoinData,
  NearCoinData
} from '@cypherock/communication';
import { AddressDB } from '@cypherock/database';
import Server from '@cypherock/server-wrapper';
import { NearWallet, BitcoinWallet, EthereumWallet } from '@cypherock/wallet';
import BigNumber from 'bignumber.js';

import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

export interface TransactionSenderRunOptions extends CyFlowRunOptions {
  addressDB: AddressDB;
  walletId: string;
  pinExists: boolean;
  passphraseExists: boolean;
  xpub: string;
  zpub?: string;
  customAccount?: string;
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

export class TransactionSender extends CyFlow {
  constructor() {
    super();
  }

  async run({
    connection,
    addressDB,
    walletId,
    pinExists,
    passphraseExists,
    xpub,
    zpub,
    customAccount,
    coinType,
    outputList,
    fee,
    isSendAll = false,
    data = {
      gasLimit: 21000,
      contractAddress: undefined,
      contractAbbr: undefined
    }
  }: TransactionSenderRunOptions) {
    let flowInterupted = false;
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
        const token = ALLCOINS[data?.contractAbbr?.toLowerCase() || coinType];

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
            .getFees({ network })
            .request();
          feeRate = res.data.FastGasPrice;
        }

        metaData = await wallet.generateMetaData(
          feeRate,
          contractAddress,
          contractAbbr
        );

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
        metaData = await wallet.generateMetaData(fee);
        const { network } = coin;

        const txnData = await wallet.generateUnsignedTransaction(
          outputList[0].address,
          outputList[0].value,
          customAccount
        );
        ({ txn: unsignedTransaction, inputs, outputs } = txnData);
        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.near.transaction
            .getFees({ network })
            .request();
          feeRate = res.data;
        }

        totalFees = feeRate;
      } else {
        wallet = new BitcoinWallet(xpub, coinType, walletId, zpub, addressDB);

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
          logger.info('No such wallet exists on the device');
          if (receivedData.data.startsWith('02')) {
            // Wallet does not exist
            this.emit('noWalletFound', false);
          } else {
            // Wallet is in partial state
            this.emit('noWalletFound', true);
          }
          throw new ExitFlowError();
        }

        const coinsConfirmed = receivedData.data.slice(0, 2);
        const acceptableTxnSize = parseInt(receivedData.data.slice(2), 16) * 2;
        logger.info('Acceptable Txn size', { acceptableTxnSize });

        if (acceptableTxnSize < unsignedTransaction.length) {
          this.emit('txnTooLarge');
          flowInterupted = true;
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
          flowInterupted = true;
          throw new ExitFlowError();
        }

        await connection.sendData(52, unsignedTransaction);

        if (!(coin instanceof EthCoinData || coin instanceof NearCoinData)) {
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
        } else if (wallet instanceof NearWallet) {
          if (!(coin instanceof NearCoinData)) {
            throw new Error('Near Wallet found, but coin is not Near.');
          }

          const signedTxn = await connection.receiveData([54], 90000);
          await connection.sendData(42, '01');

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
    }
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
            .getFees({ network })
            .request();
          feeRate = res.data.FastGasPrice;
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
        const token = ALLCOINS[data?.contractAbbr?.toLowerCase() || coinType];

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
          isSendAll
        );
        totalFees = calcData.fees
          .dividedBy(new BigNumber(coin.multiplier))
          .toString(10);
        const token = ALLCOINS[data?.contractAbbr?.toLowerCase() || coinType];

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
      } else {
        const wallet = new BitcoinWallet(xpub, coinType, walletId, zpub);

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
