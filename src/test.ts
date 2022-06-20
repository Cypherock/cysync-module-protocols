import { createPort } from '@cypherock/communication';
import { CardAuthenticator } from './app';

const testRun = async () => {
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

testRun();
