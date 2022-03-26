import SerialPort from 'serialport';

import { logger } from './index';

export const connectionOpen = (connection: SerialPort): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (connection.isOpen) {
      logger.warn('Port was already open');
      resolve();
      return;
    }

    connection.open(err => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
};

export const connectionClose = (connection: SerialPort): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!connection.isOpen) {
      logger.warn('Port was already closed');
      resolve();
      return;
    }

    connection.close(err => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
};
