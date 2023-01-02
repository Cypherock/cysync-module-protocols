import {
  EthCoinData,
  NearCoinData,
  SolanaCoinData
} from '@cypherock/communication';
import { BtcCoinData, COINS, hexToAscii } from '@cypherock/communication';
import { Account, AccountDB } from '@cypherock/database';
import {
  BitcoinWallet,
  EthereumWallet,
  NearWallet,
  SolanaWallet
} from '@cypherock/wallet';

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

export const createCoinIndex = (
  _sdkVersion: string,
  selectedCoin: { accountIndex: number; accountType: string; id: string }
) => {
  const coin = COINS[selectedCoin.id];

  if (coin instanceof BtcCoinData) {
    return BitcoinWallet.getDerivationPath(
      selectedCoin.accountIndex,
      selectedCoin.accountType,
      coin.coinIndex
    );
  }
  if (coin instanceof EthCoinData) {
    return EthereumWallet.getDerivationPath(
      selectedCoin.accountIndex,
      selectedCoin.accountType,
      coin.chain
    );
  }
  if (coin instanceof NearCoinData) {
    return NearWallet.getDerivationPath(
      selectedCoin.accountIndex,
      selectedCoin.accountType
    );
  }
  if (coin instanceof SolanaCoinData) {
    return SolanaWallet.getDerivationPath(
      selectedCoin.accountIndex,
      selectedCoin.accountType
    );
  }
  throw new Error('Invalid coin type');
};
