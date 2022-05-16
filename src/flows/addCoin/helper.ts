import {
  BtcCoinData,
  CoinData,
  COINS,
  EthCoinData,
  hexToAscii,
  intToUintByte
} from '@cypherock/communication';
import { Coin2 } from '@cypherock/database';

export const formatCoinsForDB = async (
  walletId: string,
  xpubRaw: string,
  coinTypes: any
): Promise<Coin2[]> => {
  const coins: Coin2[] = [];
  let sliceIndex = 0;
  for (let i = 0; i < coinTypes.length; i++) {
    const x = xpubRaw.slice(sliceIndex, sliceIndex + 222);
    let z;
    sliceIndex += 224;

    const coinData = COINS[coinTypes[i]];
    if (!coinData) {
      throw new Error(`Cannot find coinType: ${coinTypes[i]}`);
    }
    if (coinData instanceof BtcCoinData && coinData.hasSegwit) {
      z = xpubRaw.slice(sliceIndex, sliceIndex + 222);
      sliceIndex += 224;
    }

    const accountXpub = hexToAscii(x);
    let accountZpub;

    if (z) {
      accountZpub = hexToAscii(z);
    }

    const coin: Coin2 = {
      totalBalance: '0',
      totalUnconfirmedBalance: '0',
      xpubBalance: '0',
      xpubUnconfirmedBalance: '0',
      slug: coinTypes[i],
      walletId,
      xpub: accountXpub,
      zpub: accountZpub,
      price: ''
    };
    coins.push(coin);
  }
  return coins;
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
