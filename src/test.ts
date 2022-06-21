import { createPort } from '@cypherock/communication';
// import { DeviceAuthenticator } from './app';
// import { CardAuthenticator } from './app';
// import { WalletAdder } from './app';
// import { LogsFetcher } from './app';
import { GetDeviceInfo } from './app';

// const addWalletTestRun = async () => {
//   process.env.userDataPath = '.';
//   const walletAdder = new WalletAdder();
//   const { connection } = await createPort();
//   await connection.beforeOperation();

//   const packetVersion = await connection.selectPacketVersion();
//   console.log({ packetVersion });

//   walletAdder.addListener('error', error => {
//     console.log('In Error');
//     console.log(error);
//   });

//   walletAdder.addListener('acceptedRequest', val => {
//     console.log({ acceptedRequest: val });
//   });

//   walletAdder.addListener('walletDetails', val => {
//     console.log({ details: val });
//   });

//   await walletAdder.run({
//     connection,
//     sdkVersion: '1.0.0'
//   });
// };

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

// const fetchLogsTestRun = async () => {
//   process.env.userDataPath = '.';
//   const logFetcher = new LogsFetcher();
//   const { connection } = await createPort();
//   await connection.beforeOperation();

//   const packetVersion = await connection.selectPacketVersion();
//   console.log({ packetVersion });

//   logFetcher.addListener('error', error => {
//     console.log('In Error');
//     console.log(error);
//   });

//   logFetcher.addListener('acceptedRequest', val => {
//     console.log({ acceptedRequest: val });
//   });

//   logFetcher.addListener('completed', val => {
//     console.log({ completed: val });
//   });

//   await logFetcher.run({
//     connection,
//     firmwareVersion: '1.0.0',
//     sdkVersion: '1.0.0',
//   });
// };

// const cardAuthTestRun = async () => {
//   const cardAuthenticator = new CardAuthenticator();
//   const { connection } = await createPort();
//   await connection.beforeOperation();

//   const packetVersion = await connection.selectPacketVersion();
//   console.log({ packetVersion });

//   cardAuthenticator.addListener('error', error => {
//     console.log('In Error');
//     console.log(error);
//   });

//   cardAuthenticator.addListener('acceptedRequest', val => {
//     console.log({ acceptedRequest: val });
//   });

//   cardAuthenticator.addListener('verified', val => {
//     console.log({ verified: val });
//   });

//   cardAuthenticator.addListener('cardError', () => {
//     console.log({ error: 'Card Error' });
//   });

//   cardAuthenticator.addListener('serialSigned', val => {
//     console.log({ msg: 'Serial is signed', val });
//   });

//   cardAuthenticator.addListener('error', val => {
//     console.log({ msg: 'Error occurred' });
//     console.log(val);
//   });

//   await cardAuthenticator.run({
//     connection,
//     firmwareVersion: '1.0.0',
//     sdkVersion: '1.0.0',
//     cardNumber: '01',
//     isTestApp: false
//   });
// };

// const deviceAuthTestRun = async () => {
//   const deviceAuthenticator = new DeviceAuthenticator();
//   const { connection } = await createPort();
//   await connection.beforeOperation();
//   const packetVersion = await connection.selectPacketVersion();
//   console.log({ packetVersion });

//   deviceAuthenticator.addListener('error', error => {
//     console.log('In Error');
//     console.log(error);
//   });

//   deviceAuthenticator.addListener('acceptedRequest', val => {
//     console.log({ acceptedRequest: val });
//   });

//   deviceAuthenticator.addListener('verified', val => {
//     console.log({ verified: val });
//   });

//   deviceAuthenticator.addListener('cardError', () => {
//     console.log({ error: 'Card Error' });
//   });

//   deviceAuthenticator.addListener('serial', val => {
//     console.log({ msg: 'Serial', val });
//   });

//   deviceAuthenticator.addListener('error', val => {
//     console.log({ msg: 'Error occurred' });
//     console.log(val);
//   });

//   await deviceAuthenticator.run({
//     connection,
//     firmwareVersion: '1.0.0',
//     sdkVersion: '1.0.0',
//     inTestApp: false
//   });
// };

getDeviceInfoTestRun();
