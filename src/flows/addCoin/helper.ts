import {
  BtcCoinData,
  CoinData,
  COINS,
  EthCoinData,
  hexToAscii,
  intToUintByte
} from '@cypherock/communication';
import { Xpub } from '@cypherock/database';

export const formatCoinsForDB = async (
  walletId: string,
  xpubRaw: string,
  coinTypes: any
): Promise<Xpub[]> => {
  const xpubs: Xpub[] = [];
  let sliceIndex = 0;
  for (let i = 0; i < coinTypes.length; i++) {
    const x = xpubRaw.slice(sliceIndex, sliceIndex + 222);
    let z;
    sliceIndex += 224;

    const coin = COINS[coinTypes[i]];
    if (!coin) {
      throw new Error(`Cannot find coinType: ${coinTypes[i]}`);
    }
    if (coin instanceof BtcCoinData && coin.hasSegwit) {
      z = xpubRaw.slice(sliceIndex, sliceIndex + 222);
      sliceIndex += 224;
    }

    const accountXpub = hexToAscii(x);
    let accountZpub;

    if (z) {
      accountZpub = hexToAscii(z);
    }

    const xpub: Xpub = {
      totalBalance: { balance: '0', unconfirmedBalance: '0' },
      xpubBalance: { balance: '0', unconfirmedBalance: '0' },
      coin: coinTypes[i],
      walletId,
      xpub: accountXpub,
      zpub: accountZpub
    };
    xpubs.push(xpub);
  }
  return xpubs;
};

export const createCoinIndexes = (selectedCoins: string[]) => {
  const coinLength = intToUintByte(selectedCoins.length, 8);
  const coinIndexList = [];
  const chainIndexList = [];

  for (const elem of selectedCoins) {
    const coin = COINS[elem];

    if (!(coin instanceof CoinData)) {
      throw new Error('Coin does not have an index: ' + elem);
    }

    const coinIndex = coin.coinIndex;
    coinIndexList.push(coinIndex);

    let chainIndex = '00';

    if (coin instanceof EthCoinData) {
      chainIndex = intToUintByte(coin.chain, 8);
    }

    chainIndexList.push(chainIndex);
  }

  return coinLength + coinIndexList.join('') + chainIndexList.join('');
};
