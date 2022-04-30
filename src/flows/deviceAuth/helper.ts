import { device as deviceServer } from '@cypherock/server-wrapper';
import crypto from 'crypto';

import { logger } from '../../utils';

export const sha256 = (message: string) => {
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(message, 'hex'));
  return hash.digest('hex');
};

export const verifySerialSignature = async (
  serial: any,
  signature: any,
  postfix1?: string,
  postfix2?: string
): Promise<string> => {
  const res = await deviceServer
    .verify({
      serial,
      signature,
      postfix1,
      postfix2
    })
    .request();
  if (res.data.verified === true) {
    return res.data.challenge;
  } else {
    logger.error('Card not verified', res.data);
    return '';
  }
};

export const verifyChallengeSignature = async (
  serial: string,
  signature: string,
  challenge: string,
  firmwareVersion: string,
  isTestApp: boolean,
  postfix1?: string,
  postfix2?: string
) => {
  const res = await deviceServer
    .challenge({
      serial,
      signature,
      challenge,
      firmwareVersion,
      postfix1,
      postfix2,
      isTestApp
    })
    .request();

  // Server replies false if not verified, and 'no device found' if there is no device with this serial number. and obviously true if verified.
  if (res.data.verified !== true) return false;
  return true;
};
