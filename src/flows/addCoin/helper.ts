import {
  BtcCoinData,
  CoinData,
  COINS,
  EthCoinData,
  FeatureName,
  hexToAscii,
  intToUintByte,
  isFeatureEnabled
} from '@cypherock/communication';
import { Account, AccountDB } from '@cypherock/database';

import { FlowError, FlowErrorType } from '../flowError';

export const formatCoinsForDB = async (
  walletId: string,
  xpubRaw: string,
  coinTypes: any
): Promise<Account[]> => {
  const coins: Account[] = [];
  let sliceIndex = 0;
  for (let i = 0; i < coinTypes.length; i++) {
    const x = xpubRaw.slice(sliceIndex, sliceIndex + 222);
    // let z;
    sliceIndex += 224;

    const coinData = COINS[coinTypes[i]];
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
      slug: coinData.abbr,
      walletId,
      xpub: accountXpub
    };
    coin.accountId = AccountDB.buildAccountIndex(coin);
    coins.push(coin);
  }
  return coins;
};

export const createCoinIndexes = (
  sdkVersion: string,
  selectedCoins: string[]
) => {
  const coinLength = intToUintByte(selectedCoins.length, 8);
  const coinIndexList = [];
  const chainIndexList = [];

  for (const elem of selectedCoins) {
    const coin = COINS[elem];

    if (!(coin instanceof CoinData)) {
      throw new FlowError(FlowErrorType.ADD_COIN_UNKNOWN_ASSET, elem);
    }

    const coinIndex = coin.coinIndex;
    coinIndexList.push(coinIndex);

    const longChainId = isFeatureEnabled(
      FeatureName.EvmLongChainId,
      sdkVersion
    );
    let chainIndex = longChainId ? '0000000000000000' : '00';

    if (coin instanceof EthCoinData) {
      chainIndex = intToUintByte(coin.chain, longChainId ? 64 : 8);
    }

    chainIndexList.push(chainIndex);
  }

  return coinLength + coinIndexList.join('') + chainIndexList.join('');
};
