import { logger } from '../../utils';

export const extractCoinListDetails = (rawCoinListDetails: string) => {
  const arr = [];
  const entryLength = 16;
  const coinIdLength = 8;
  if (rawCoinListDetails.length % entryLength !== 0) {
    logger.warn(`Invalid rawCoinListDetails : ${rawCoinListDetails}`);
    return defaultCoinList('2.2.0'); // returning last coin list entry with max coins
  }
  for (let i = 0; i < rawCoinListDetails.length; i += entryLength) {
    arr.push({
      id: parseInt(rawCoinListDetails.slice(i, i + coinIdLength), 16),
      version: parseInt(
        rawCoinListDetails.slice(i + coinIdLength, i + entryLength),
        16
      )
    });
  }
  return arr;
};

export const defaultCoinList = (sdkVersion: string) => {
  const arr = [];
  for (let i = 0; i < 7; i++) {
    arr.push({
      id: i + 1,
      version: 0
    });
  }
  if (sdkVersion === '2.2.0' || sdkVersion === '2.1.0') {
    return arr;
  }
  return arr.slice(0, arr.length - 1);
};
