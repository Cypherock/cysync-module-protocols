import {
  CoinData,
  EthCoinData,
  FeatureName,
  intToUintByte,
  isFeatureEnabled
} from '@cypherock/communication';
import { BtcCoinData, COINS, hexToAscii } from '@cypherock/communication';
import { Account, AccountDB } from '@cypherock/database';

import { FlowError, FlowErrorType } from '../flowError';

export const formatCoinsForDB = async (
  walletId: string,
  xpubRaw: string,
  coinId: any
): Promise<Account> => {
  let sliceIndex = 0;
  const x = xpubRaw.slice(sliceIndex, sliceIndex + 222);
  // let z;
  sliceIndex += 224;

  const coinData = COINS[coinId];
  if (coinData instanceof BtcCoinData && coinData.hasSegwit) {
    // z = xpubRaw.slice(sliceIndex, sliceIndex + 222);
    sliceIndex += 224;
  }

  const accountXpub = hexToAscii(x);

  const coin: Account = {
    accountId: '',
    accountIndex: 0,
    coinId: coinData.id,
    accountType: '',
    totalBalance: '0',
    totalUnconfirmedBalance: '0',
    walletId,
    xpub: accountXpub
  };
  coin.accountId = AccountDB.buildAccountIndex(coin);

  return coin;
};

// export const formatCoinsForDB = async (
//   walletId: string,
//   xpubRaw: string,
//   coinId: string
// ): Promise<Account[]> => {
//   let sliceIndex = 0;
//   const x = xpubRaw.slice(sliceIndex, sliceIndex + 222);
//   // let z;
//   sliceIndex += 224;

//   const coinData = COINS[coinId];

//   const accountXpub = hexToAscii(x);

//   const coin: Account = {
//     accountId: '',
//     accountIndex: 0,
//     coinId: coinData.id,
//     accountType: '',
//     totalBalance: '0',
//     totalUnconfirmedBalance: '0',
//     walletId,
//     xpub: accountXpub
//   };
//   coin.accountId = AccountDB.buildAccountIndex(coin);
//   return [coin];
// };

// export const createCoinIndex = (
//   _sdkVersion: string,
//   selectedCoin: { accountIndex: number; accountType: string; id: string }
// ) => {
//   const coin = COINS[selectedCoin.id];

//   if (coin instanceof BtcCoinData) {
//     return (
//       BitcoinWallet.getDerivationPath(
//         selectedCoin.accountIndex,
//         selectedCoin.accountType
//       ) + coin.coinIndex
//     );
//   }

//   return '';
// };

export const createCoinIndex = (
  sdkVersion: string,
  selectedCoin: {
    accountIndex: number;
    accountType: string;
    id: string;
  }
) => {
  const coinLength = intToUintByte(1, 8);
  const coinIndexList = [];
  const chainIndexList = [];

  const coin = COINS[selectedCoin.id];

  if (!(coin instanceof CoinData)) {
    throw new FlowError(FlowErrorType.ADD_COIN_UNKNOWN_ASSET, selectedCoin.id);
  }

  const coinIndex = coin.coinIndex;
  coinIndexList.push(coinIndex);

  const longChainId = isFeatureEnabled(FeatureName.EvmLongChainId, sdkVersion);
  let chainIndex = longChainId ? '0000000000000000' : '00';

  if (coin instanceof EthCoinData) {
    chainIndex = intToUintByte(coin.chain, longChainId ? 64 : 8);
  }

  chainIndexList.push(chainIndex);

  return coinLength + coinIndexList.join('') + chainIndexList.join('');
};
