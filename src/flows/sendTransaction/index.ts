import {
  ALLCOINS,
  COINS,
  EthCoinData,
  receiveAnyCommand,
  receiveCommand,
  sendData
} from '@cypherock/communication';
import Server from '@cypherock/server-wrapper';
import { BitcoinWallet, EthereumWallet } from '@cypherock/wallet';
import BigNumber from 'bignumber.js';

import { logger } from '../../utils';
import { CyFlow, CyFlowRunOptions } from '../index';

export interface TransactionSenderRunOptions extends CyFlowRunOptions {
  addressDbUtil: any;
  walletId: string;
  pinExists: boolean;
  passphraseExists: boolean;
  xpub: string;
  zpub?: string;
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
    packetVersion,
    addressDbUtil,
    walletId,
    pinExists,
    passphraseExists,
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
    }
  }: TransactionSenderRunOptions) {
    let flowInterupted = false;
    try {
      this.cancelled = false;
      let unsignedTransaction = '';
      let metaData = '';
      let feeRate;
      let wallet: BitcoinWallet | EthereumWallet;
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
        const { gasLimit, contractAddress, contractAbbr } = data;
        const { network, chain } = coin;
        wallet = new EthereumWallet(xpub, coin);

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.eth.transaction.getFees({ network });
          // 1000000000 for fees in Gwei from wei
          feeRate = Math.round(res.data.result / 1000000000);
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
          .dividedBy(new BigNumber(coin.multiplier))
          .toString();

        totalFees = txFee.dividedBy(new BigNumber(coin.multiplier)).toNumber();
      } else {
        wallet = new BitcoinWallet(xpub, coinType, zpub, addressDbUtil);

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.bitcoin.transaction.getFees({ coinType });
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
        await sendData(
          connection,
          50,
          walletId + metaData,
          packetVersion,
          undefined
        );
        this.emit('metadataSent');

        const receivedData: any = await receiveAnyCommand(
          connection,
          [51, 75, 76],
          packetVersion,
          30000
        );
        if (receivedData.commandType === 75) {
          logger.info('Wallet is locked');
          this.emit('locked');
          return;
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
          return;
        }

        const coinsConfirmed = receivedData.data.slice(0, 2);
        const acceptableTxnSize = parseInt(receivedData.data.slice(2), 16) * 2;
        logger.info('Acceptable Txn size', { acceptableTxnSize });

        if (acceptableTxnSize < unsignedTransaction.length) {
          this.emit('txnTooLarge');
          flowInterupted = true;
          return;
        }

        if (coinsConfirmed === '01') {
          this.emit('coinsConfirmed', true);
        } else if (coinsConfirmed === '00') {
          this.emit('coinsConfirmed', false);
          return;
        } else {
          throw new Error('Unidentified command from the device');
        }

        if (unsignedTransaction === '') {
          logger.info('Insufficient funds.');
          this.emit('insufficientFunds', true);
          flowInterupted = true;
          return;
        }

        await sendData(
          connection,
          52,
          unsignedTransaction,
          packetVersion,
          undefined
        );

        if (!(coin instanceof EthCoinData)) {
          const utxoRequest: any = await receiveCommand(
            connection,
            51,
            packetVersion,
            10000
          );
          if (utxoRequest !== '02') {
            throw new Error('Invalid data from device');
          }

          for (const utxo of utxoList) {
            await sendData(connection, 51, utxo, packetVersion);
            const utxoResponse: any = await receiveCommand(
              connection,
              51,
              packetVersion,
              10000
            );
            if (utxoResponse.startsWith('00')) {
              throw new Error('UTXO was not verified');
            }
          }
        }

        const recipientVerified: any = await receiveCommand(
          connection,
          53,
          packetVersion,
          120000
        );
        if (recipientVerified === '01') {
          this.emit('verified', true);
        } else {
          this.emit('verified', parseInt(recipientVerified, 16));
          return;
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

        if (pinExists) {
          const pinData: any = await receiveAnyCommand(
            connection,
            [47, 79, 81],
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
          const pinEntered = pinData.data;

          if (pinEntered === '01') {
            this.emit('pinEntered', true);
          } else {
            this.emit('pinEntered', false);
            return;
          }
        }

        const data1: any = await receiveAnyCommand(
          connection,
          [48, 79, 81, 71],
          packetVersion,
          45000
        );
        if (data1.commandType === 79) {
          this.emit('coinsConfirmed', false);
          return;
        }
        if (data1.commandType === 81) {
          this.emit('noWalletOnCard');
          return;
        }
        if (data1.commandType === 71) {
          this.emit('cardError');
          return;
        }
        this.emit('cardsTapped', true);

        if (wallet instanceof EthereumWallet) {
          if (!(coin instanceof EthCoinData)) {
            throw new Error('ETH Wallet found, but coin is not ETH.');
          }

          const signedTxn: any = await receiveCommand(
            connection,
            54,
            packetVersion,
            90000
          );
          await sendData(connection, 42, '01', packetVersion);

          const signedTxnEth = wallet.getSignedTransaction(
            unsignedTransaction,
            signedTxn,
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
          const inputSignatures: string[] = [];
          for (const _ of txnInfo.inputs) {
            const inputSig: any = await receiveCommand(
              connection,
              54,
              packetVersion,
              90000
            );
            await sendData(connection, 42, '01', packetVersion);
            inputSignatures.push(inputSig);
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
      this.emit('error', e);
      flowInterupted = true;
    } finally {
      await this.onEnd(connection, packetVersion, {
        dontAbort: !flowInterupted
      });
    }
  }

  public async calcApproxFee(
    xpub: string,
    zpub: string | undefined,
    coinType: string,
    outputList: Array<{ address: string; value?: BigNumber }>,
    fee: number,
    isSendAll?: boolean,
    data = {
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
          const res = await Server.eth.transaction.getFees({ network });
          // 1000000000 for fees in Gwei from wei
          feeRate = Math.round(res.data.result / 1000000000);
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
        const token = ALLCOINS[data.contractAbbr || coinType];

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
        const wallet = new BitcoinWallet(xpub, coinType, zpub);

        if (fee) {
          feeRate = fee;
        } else {
          logger.info(`Fetching optimal fees from the internet.`);
          const res = await Server.bitcoin.transaction.getFees({ coinType });
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
