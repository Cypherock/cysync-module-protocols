import { createPort, DeviceConnection } from '@cypherock/communication';
import fs from 'fs';

import { logger } from '../../utils';

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;

export async function upgrade(
  prevConnection: DeviceConnection,
  input: string
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    logger.info('Updating device...');
    fs.readFile(input, async (error, data) => {
      if (error) {
        logger.error(error);
        reject(error);
        return;
      }

      let isCompleted = false;
      let retries = 1;
      let errorMsg: Error | undefined;

      let connection: DeviceConnection | undefined;
      if (prevConnection.inBootloader) {
        connection = prevConnection;
      }

      while (!isCompleted && retries <= MAX_RETRIES) {
        try {
          if (!connection) {
            ({ connection } = await createPort());
          }

          if (!connection.inBootloader) {
            throw new Error('Device not in bootloader mode');
          }

          await connection.beforeOperation();
          await connection.sendStmData(data.toString('hex'));
          await connection.afterOperation();

          isCompleted = true;
          connection.destroy();
          resolve();
        } catch (error) {
          retries += 1;
          isCompleted = false;

          if (retries > MAX_RETRIES) {
            logger.warn('Error while updating device, max retries exceeded.');
          } else {
            logger.warn('Error while updating device, retrying...');
          }

          logger.warn(error);
          errorMsg = error as any;

          if (retries <= MAX_RETRIES) {
            await sleep(2000);
          }
        }
      }

      if (!isCompleted) {
        if (connection) {
          connection.destroy();
        }
        reject(errorMsg);
        return;
      }
    });
  });
}
