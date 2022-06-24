import { createPort } from '@cypherock/communication';
import { DeviceAuthenticator } from './app';
import { CardAuthenticator } from './app';
import { WalletAdder } from './app';
import { LogsFetcher } from './app';
import { GetDeviceInfo } from './app';
import { CoinAdder } from './app';
import { CancelFlow } from './app';
import { TransactionReceiver } from './app';
import { DeviceUpdater } from './app';

const addWalletTestRun = async () => {
  process.env.userDataPath = '.';
  const walletAdder = new WalletAdder();
  const { connection } = await createPort();
  await connection.beforeOperation();

  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  walletAdder.addListener('error', error => {
    console.log('In Error');
    console.log(error);
  });

  walletAdder.addListener('acceptedRequest', val => {
    console.log({ acceptedRequest: val });
  });

  walletAdder.addListener('walletDetails', val => {
    console.log({ details: val });
  });

  await walletAdder.run({
    connection,
    sdkVersion: '1.0.0'
  });
};

const getDeviceInfoTestRun = async () => {
  process.env.userDataPath = '.';
  const getDeviceInfo = new GetDeviceInfo();
  const { connection } = await createPort();
  await connection.beforeOperation();

  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  getDeviceInfo.addListener('error', error => {
    console.log('In Error');
    console.log(error);
  });

  getDeviceInfo.addListener('sdkVersion', val => {
    console.log({ sdkVersion: val });
  });

  getDeviceInfo.addListener('firmwareVersion', val => {
    console.log({ firmwareVersion: val });
  });

  getDeviceInfo.addListener('serial', val => {
    console.log({ serial: val });
  });

  getDeviceInfo.addListener('auth', val => {
    console.log({ auth: val });
  });

  getDeviceInfo.addListener('isNew', val => {
    console.log({ isNew: val });
  });

  getDeviceInfo.addListener('lastAuth', val => {
    console.log({ lastAuth: val });
  });

  await getDeviceInfo.run({
    connection,
    sdkVersion: '1.0.0',
    deviceDB: { getBySerial: () => Promise.resolve(null) } as any
  });
};

const addCoinTestRun = async () => {
  process.env.userDataPath = '.';
  const addCoin = new CoinAdder();
  const { connection } = await createPort();
  await connection.beforeOperation();

  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  addCoin.addListener('error', error => {
    console.log('In Error');
    console.log(error);
  });

  addCoin.addListener('coinsConfirmed', val => {
    console.log({ coinsConfirmed: val });
  });

  addCoin.addListener('passphraseEntered', val => {
    console.log({ passphraseEntered: val });
  });

  addCoin.addListener('pinEntered', val => {
    console.log({ pinEntered: val });
  });

  addCoin.addListener('cardTapped', val => {
    console.log({ cardTapped: val });
  });

  addCoin.addListener('locked', val => {
    console.log({ locked: val });
  });

  addCoin.addListener('noWalletFound', val => {
    console.log({ noWalletFound: val });
  });

  addCoin.addListener('xpubList', val => {
    console.log({ xpubList: val });
  });

  await addCoin.run({
    connection,
    sdkVersion: '1.0.0',
    walletId:
      'C372AF88F64E0A40439F97EE98A3A0A03E9B2AC348B464D0CAB7F32EE8482298',
    isResync: false,
    pinExists: false,
    passphraseExists: false,
    selectedCoins: ['btc']
  });
};

const receiveAddressTestRun = async () => {
  process.env.userDataPath = '.';
  const receiveTxn = new TransactionReceiver();
  const { connection } = await createPort();
  await connection.beforeOperation();

  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  receiveTxn.addListener('error', error => {
    console.log('In Error');
    console.log(error);
  });

  receiveTxn.addListener('coinsConfirmed', val => {
    console.log({ coinsConfirmed: val });
  });

  receiveTxn.addListener('passphraseEntered', val => {
    console.log({ passphraseEntered: val });
  });

  receiveTxn.addListener('pinEntered', val => {
    console.log({ pinEntered: val });
  });

  receiveTxn.addListener('cardTapped', val => {
    console.log({ cardTapped: val });
  });

  receiveTxn.addListener('locked', val => {
    console.log({ locked: val });
  });

  receiveTxn.addListener('noWalletFound', val => {
    console.log({ noWalletFound: val });
  });

  receiveTxn.addListener('xpubList', val => {
    console.log({ xpubList: val });
  });

  receiveTxn.addListener('derivationPathSent', val => {
    console.log({ derivationPathSent: val });
  });

  receiveTxn.addListener('receiveAddress', val => {
    console.log({ address: val });
  });

  receiveTxn.addListener('addressVerified', val => {
    console.log({ addressVerified: val });
  });

  await receiveTxn.run({
    connection,
    sdkVersion: '1.0.0',
    walletId:
      'C372AF88F64E0A40439F97EE98A3A0A03E9B2AC348B464D0CAB7F32EE8482298',
    pinExists: false,
    passphraseExists: false,
    xpub: '',
    addressDB: '' as any,
    coinType: 'btc'
  });
};

const fetchLogsTestRun = async () => {
  process.env.userDataPath = '.';
  const logFetcher = new LogsFetcher();
  const { connection } = await createPort();
  await connection.beforeOperation();

  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  logFetcher.addListener('error', error => {
    console.log('In Error');
    console.log(error);
  });

  logFetcher.addListener('acceptedRequest', val => {
    console.log({ acceptedRequest: val });
  });

  logFetcher.addListener('completed', val => {
    console.log({ completed: val });
  });

  await logFetcher.run({
    connection,
    firmwareVersion: '1.0.0',
    sdkVersion: '1.0.0'
  });
};

const cardAuthTestRun = async () => {
  const cardAuthenticator = new CardAuthenticator();
  const { connection } = await createPort();
  await connection.beforeOperation();

  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  cardAuthenticator.addListener('error', error => {
    console.log('In Error');
    console.log(error);
  });

  cardAuthenticator.addListener('acceptedRequest', val => {
    console.log({ acceptedRequest: val });
  });

  cardAuthenticator.addListener('verified', val => {
    console.log({ verified: val });
  });

  cardAuthenticator.addListener('cardError', () => {
    console.log({ error: 'Card Error' });
  });

  cardAuthenticator.addListener('serialSigned', val => {
    console.log({ msg: 'Serial is signed', val });
  });

  cardAuthenticator.addListener('error', val => {
    console.log({ msg: 'Error occurred' });
    console.log(val);
  });

  await cardAuthenticator.run({
    connection,
    firmwareVersion: '1.0.0',
    sdkVersion: '1.0.0',
    cardNumber: '01',
    isTestApp: false
  });
};

const deviceAuthTestRun = async () => {
  const deviceAuthenticator = new DeviceAuthenticator();
  const { connection } = await createPort();
  await connection.beforeOperation();
  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  deviceAuthenticator.addListener('error', error => {
    console.log('In Error');
    console.log(error);
  });

  deviceAuthenticator.addListener('acceptedRequest', val => {
    console.log({ acceptedRequest: val });
  });

  deviceAuthenticator.addListener('verified', val => {
    console.log({ verified: val });
  });

  deviceAuthenticator.addListener('cardError', () => {
    console.log({ error: 'Card Error' });
  });

  deviceAuthenticator.addListener('serial', val => {
    console.log({ msg: 'Serial', val });
  });

  deviceAuthenticator.addListener('error', val => {
    console.log({ msg: 'Error occurred' });
    console.log(val);
  });

  await deviceAuthenticator.run({
    connection,
    firmwareVersion: '1.0.0',
    sdkVersion: '1.0.0',
    inTestApp: false
  });
};

const deviceUpgradeTestRun = async () => {
  const deviceUpdater = new DeviceUpdater();
  const { connection } = await createPort();
  await connection.beforeOperation();
  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  deviceUpdater.addListener('error', error => {
    console.log('In Error');
    console.log(error);
  });

  deviceUpdater.addListener('updateConfirmed', val => {
    console.log({ acceptedRequest: val });
  });

  deviceUpdater.addListener('notReady', val => {
    console.log({ notReady: val });
  });

  deviceUpdater.addListener('error', val => {
    console.log({ msg: 'Error occurred' });
    console.log(val);
  });

  await deviceUpdater.run({
    connection,
    firmwareVersion: '01000000',
    sdkVersion: '1.0.0',
    firmwarePath: './app_dfu_package.bin'
  });
};

const abortCommand = async () => {
  const abort = new CancelFlow();
  const { connection } = await createPort();
  await connection.beforeOperation();
  const packetVersion = await connection.selectPacketVersion();
  console.log({ packetVersion });

  await abort.run({
    connection,
    sdkVersion: '1.0.0'
  });
};

const run = async (
  flow:
    | 'addCoin'
    | 'cardAuth'
    | 'deviceAuth'
    | 'getDeviceInfo'
    | 'addWallet'
    | 'fetchLogs'
    | 'abort'
    | 'receiveTxn'
    | 'deviceUpgrade'
) => {
  switch (flow) {
    case 'cardAuth':
      await cardAuthTestRun();
      break;
    case 'deviceAuth':
      await deviceAuthTestRun();
      break;
    case 'getDeviceInfo':
      await getDeviceInfoTestRun();
      break;
    case 'fetchLogs':
      await fetchLogsTestRun();
      break;
    case 'addWallet':
      await addWalletTestRun();
      break;
    case 'addCoin':
      await addCoinTestRun();
      break;
    case 'receiveTxn':
      await receiveAddressTestRun();
      break;
    case 'deviceUpgrade':
      await deviceUpgradeTestRun();
      break;
    case 'abort':
      await abortCommand();
      break;
  }
};

run('deviceUpgrade');
