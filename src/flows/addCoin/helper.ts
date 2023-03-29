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
  selectedCoin: { accountIndex: number; accountType: string; id: string }
): Promise<Account> => {
  let sliceIndex = 0;
  const x = xpubRaw.slice(sliceIndex, sliceIndex + 222);
  sliceIndex += 224;

  const coinData = COINS[selectedCoin.id];
  if (!coinData) throw new Error('Invalid coin type: ' + selectedCoin.id);
  const accountXpub = hexToAscii(x);

  const params = {
    accountIndex: selectedCoin.accountIndex,
    accountType: selectedCoin.accountType,
    coinIndex: coinData.coinIndex
  };

  let path = '';

  if (coinData instanceof BtcCoinData) {
    path = BitcoinWallet.getDerivationPath(params);
  } else if (coinData instanceof EthCoinData) {
    path = EthereumWallet.getDerivationPath({
      ...params,
      chainId: coinData.chain
    });
  } else if (coinData instanceof NearCoinData) {
    path = NearWallet.getDerivationPath({
      ...params,
      addressIndex: selectedCoin.accountIndex
    });
  } else if (coinData instanceof SolanaCoinData) {
    path = SolanaWallet.getDerivationPath(params);
  } else {
    throw new Error('Invalid coin type: ' + selectedCoin.id);
  }

  const account: Account = {
    name: '',
    accountId: '',
    accountIndex: selectedCoin.accountIndex,
    coinId: coinData.id,
    accountType: selectedCoin.accountType,
    derivationPath: path,
    totalBalance: '0',
    totalUnconfirmedBalance: '0',
    walletId,
    xpub: accountXpub
  };
  account.accountId = AccountDB.buildAccountIndex(account);
  account.name = AccountDB.createAccountName(account);
  return account;
};

export const createCoinIndex = (
  _sdkVersion: string,
  selectedCoin: { accountIndex: number; accountType: string; id: string }
) => {
  const coin = COINS[selectedCoin.id];
  if (!coin) throw new Error('Invalid coin type: ' + selectedCoin.id);

  const params = {
    accountIndex: selectedCoin.accountIndex,
    accountType: selectedCoin.accountType,
    coinIndex: coin.coinIndex
  };
  if (coin instanceof BtcCoinData) {
    return BitcoinWallet.getProtocolDerivationPath(params);
  }
  if (coin instanceof EthCoinData) {
    return EthereumWallet.getProtocolDerivationPath({
      ...params,
      chainId: coin.chain
    });
  }
  if (coin instanceof NearCoinData) {
    return NearWallet.getProtocolDerivationPath({
      ...params,
      addressIndex: selectedCoin.accountIndex
    });
  }
  if (coin instanceof SolanaCoinData) {
    return SolanaWallet.getProtocolDerivationPath(params);
  }

  throw new Error('Invalid coin type: ' + selectedCoin.id);
};
