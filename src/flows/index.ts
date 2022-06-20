export * from './error';
import {
  DeviceConnection,
  PacketVersionMap
  // DeviceIdleState
} from '@cypherock/communication';
import { EventEmitter } from 'events';

import { logger } from '../utils';

export interface CyFlowRunOptions {
  connection: DeviceConnection;
  sdkVersion: string;
}

/**
 * Generic flow class which is to be used in creating all the protocol flows.
 *
 * @member cancelled : is true if the operation is cancelled for this instance.
 * Used to ignore errors thrown by the communication module due to the cancelled
 * operation.
 *
 * @extends EventEmitter
 */
export abstract class CyFlow extends EventEmitter {
  public cancelled: boolean;

  /**
   * calls the super class and sets the cancelled to false as default.
   */
  constructor() {
    super();
    this.cancelled = false;
  }

  async run(_options: CyFlowRunOptions): Promise<any> {
    // To be overloaded by interiting classes
  }

  async deviceReady(connection: DeviceConnection) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!connection.isOpen) {
          throw new Error('Connection was not open');
        }

        const version = connection.getPacketVersion();

        if (version === PacketVersionMap.v3) {
          await connection.getStatus();
          // resolve(status.deviceIdleState === DeviceIdleState.IDLE);
          resolve(true);
        } else {
          await connection.sendData(41, '00', 2);
          connection
            .receiveData([42], 2000)
            .then(deviceResponse => {
              resolve(String(deviceResponse.data).slice(0, 2) === '02');
            })
            .catch(error => {
              if (error) {
                resolve(false);
              }
            });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Remove all listeners which was added while sending and receiving data.
   * This will prevent memory leaks.
   *
   * NOTE: Using `connection.removeAllListeners` is preventing any further
   * listeners from being fired.
   */
  removeConnectionListeners(connection: DeviceConnection) {
    for (const event of ['close', 'data', 'ack']) {
      const allListeners = connection.listeners(event);
      for (const listener of allListeners) {
        connection.removeListener(event, listener as () => void);
      }
    }
  }

  async onStart(connection: DeviceConnection) {
    await connection.beforeOperation();
  }

  async onEnd(
    connection: DeviceConnection,
    options?: { dontRemoveListeners?: boolean; dontAbort?: boolean }
  ) {
    console.log('In on End');
    try {
      try {
        if (!(options && options.dontAbort)) {
          await this.cancel(connection);
        }
      } catch (error) {
        logger.error('Error on cancel flow');
        logger.error(error);
      }

      await connection.afterOperation();

      if (options && options.dontRemoveListeners) {
        return;
      }

      this.removeAllListeners();
    } catch (error) {
      logger.error('Error in onEnd');
      logger.error(error);
    }
  }

  /**
   * cancels the current flow by sending an abort command and closing the connection
   * @param connection - the serialport connection instance
   */
  async cancel(connection: DeviceConnection): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.cancelled = true;
      if (connection && connection.isOpen()) {
        connection
          .sendData(42, '04')
          .then(() => {
            logger.info('Desktop sent abort command');

            // Closing connection will cause the `run` function to result in an error.
            connection
              .afterOperation()
              .then(() => {})
              .catch(() => {})
              .finally(() => resolve(true));
          })
          .catch(e => {
            connection
              .afterOperation()
              .then(() => {})
              .catch(() => {})
              .finally(() => reject(e));
          });
      } else {
        resolve(false);
      }
    });
  }
}
