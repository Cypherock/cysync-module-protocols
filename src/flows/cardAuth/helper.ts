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
  message: any
): Promise<string> => {
  const res = await deviceServer
    .verify({
      serial,
      signature,
      message
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
  _email?: string,
  _cysyncVersion?: string,
  _onlyFailure?: boolean,
  _sessionId?: string
) => {
  const res = await deviceServer
    .challenge({
      serial,
      signature,
      challenge,
      firmwareVersion
    })
    .request();

  // Server replies false if not verified, and 'no device found' if there is no device with this serial number. and obviously true if verified.
  return {
    verified: res.data.verified === true,
    sessionId: res.data.sessionId
  };
};
