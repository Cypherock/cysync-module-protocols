import { createPort, stmUpdateSendData } from '@cypherock/communication';
import fs from 'fs';

import { logger } from '../../utils';
import { connectionOpen } from '../../utils/connection';

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;

export async function upgrade(input: string): Promise<void> {
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

      while (!isCompleted && retries <= MAX_RETRIES) {
        try {
          const { connection } = await createPort();

          await connectionOpen(connection);
          await stmUpdateSendData(connection, data.toString('hex'));

          isCompleted = true;
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
        reject(errorMsg);
        return;
      }
    });
  });
}
