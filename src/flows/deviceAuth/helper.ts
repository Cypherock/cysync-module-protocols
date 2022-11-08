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
  const verifyParams = {
    serial,
    signature,
    postfix1,
    postfix2
  };
  logger.info('Verifying serial signature: Params', verifyParams);
  const res = await deviceServer.verify(verifyParams).request();
  logger.info('Verify serial signature response', res.data, res.status);
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
  postfix2?: string,
  email?: string,
  cysyncVersion?: string
) => {
  const challengeParams = {
    serial,
    signature,
    challenge,
    firmwareVersion,
    postfix1,
    postfix2,
    isTestApp,
    email,
    cysyncVersion
  };
  logger.info('Verifying challenge signature: Params', challengeParams);
  const res = await deviceServer.challenge(challengeParams).request();
  logger.info('Verify challenge signature response', res.data, res.status);
  // Server replies false if not verified, and 'no device found' if there is no device with this serial number. and obviously true if verified.
  if (res.data.verified !== true) return false;
  return true;
};
