import { hexToAscii } from '@cypherock/communication';

/**
 * Extracts the wallet details from raw hex data from the device.
 * @param rawData - raw hex data from the device.
 */
export const extractWalletDetails = (rawData: any) => {
  const name: string = hexToAscii(String(rawData).slice(0, 32)).replace(
    /[^\w\s]/gi,
    ''
  );
  const walletInfo: number = parseInt(String(rawData).slice(32, 34), 10);
  let passwordSet: boolean;
  let passphraseSet: boolean;

  switch (walletInfo) {
    case 0:
      passwordSet = false;
      passphraseSet = false;
      break;
    case 1:
      passwordSet = true;
      passphraseSet = false;
      break;
    case 2:
      passwordSet = false;
      passphraseSet = true;
      break;
    case 3:
      passwordSet = true;
      passphraseSet = true;
      break;
    default:
      throw new Error('Invalid wallet info from device: ' + walletInfo);
  }

  const walletId: string = String(rawData).slice(34);
  return { _id: walletId, name, passwordSet, passphraseSet };
};
