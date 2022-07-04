import { createPort, DeviceConnection } from '@cypherock/communication';
import fs from 'fs';

import { logger } from '../../utils';

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function upgrade(
  prevConnection: DeviceConnection,
  input: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    logger.info('Updating device...');
    fs.readFile(input, async (error, data) => {
      if (error) {
        logger.error(error);
        reject(error);
        return;
      }

      let connection: DeviceConnection | undefined;
      if (prevConnection.inBootloader) {
        connection = prevConnection;
      }

      try {
        if (!connection) {
          ({ connection } = await createPort());
        }

        if (!connection.inBootloader) {
          throw new Error('Device not in bootloader mode');
        }

        await connection.beforeOperation();
        await connection.sendStmData(data.toString('hex'), onProgress);
        connection.afterOperation();

        connection.destroy();
        return resolve();
      } catch (error) {
        logger.error('Error while updating device, max retries exceeded.');
        logger.error(error);

        if (connection) {
          connection.destroy();
        }

        reject(error);
      }
    });
  });
}
