import { BtcCoinData, COINS, hexToAscii } from '@cypherock/communication';
import { Account, AccountDB } from '@cypherock/database';
import { BitcoinWallet } from '@cypherock/wallet';

export const formatCoinsForDB = async (
  walletId: string,
  xpubRaw: string,
  coinType: string
): Promise<Account[]> => {
  let sliceIndex = 0;
  const x = xpubRaw.slice(sliceIndex, sliceIndex + 222);
  // let z;
  sliceIndex += 224;

  const coinData = COINS[coinType];

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
  return [coin];
};

export const createCoinIndex = (
  _sdkVersion: string,
  selectedCoin: { accountIndex: number; accountType: string; id: string }
) => {
  const coin = COINS[selectedCoin.id];

  if (coin instanceof BtcCoinData) {
    return (
      BitcoinWallet.getDerivationPath(
        selectedCoin.accountIndex,
        selectedCoin.accountType
      ) + coin.coinIndex
    );
  }

  return '';
};
