import {
  PacketVersion,
  PacketVersionMap,
  receiveCommand,
  sendData
} from '@cypherock/communication';
import { EventEmitter } from 'events';
import SerialPort from 'serialport';

import { logger } from '../utils';
import { connectionClose, connectionOpen } from '../utils/connection';

export interface CyFlowRunOptions {
  connection: SerialPort;
  sdkVersion: string;
  packetVersion: PacketVersion;
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

  /**
   * Helper function to open port
   */
  async openConnection(connection: SerialPort) {
    await connectionOpen(connection);
    this.emit('connectionOpen');
  }

  async deviceReady(
    connection: SerialPort,
    version: PacketVersion = PacketVersionMap.v1
  ) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!connection.isOpen) {
          throw new Error('Connection was not open');
        }

        await sendData(connection, 41, '00', version, 2);
        receiveCommand(connection, 42, version, 2000)
          .then((deviceResponse: any) => {
            resolve(String(deviceResponse).slice(0, 2) === '02');
          })
          .catch(error => {
            if (error) {
              resolve(false);
            }
          });
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
  removeConnectionListeners(connection: SerialPort) {
    for (const event of ['close', 'data']) {
      const allListeners = connection.listeners(event);
      for (const listener of allListeners) {
        connection.removeListener(event, listener as () => void);
      }
    }
  }

  /**
   * Helper function to close port
   */
  async closeConnection(connection: SerialPort) {
    await connectionClose(connection);
    this.removeConnectionListeners(connection);

    this.emit('connectionClose');
  }

  async onStart(connection: SerialPort) {
    await this.openConnection(connection);
  }

  async onEnd(
    connection: SerialPort,
    version: PacketVersion,
    options?: { dontRemoveListeners?: boolean; dontAbort?: boolean }
  ) {
    try {
      try {
        if (!(options && options.dontAbort)) {
          await this.cancel(connection, version);
        }
      } catch (error) {
        logger.error('Error on cancel flow');
        logger.error(error);
      }

      await this.closeConnection(connection);

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
  async cancel(
    connection: SerialPort,
    version: PacketVersion
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.cancelled = true;
      if (connection && connection.isOpen) {
        sendData(connection, 42, '04', version)
          .then(() => {
            logger.info('Desktop sent abort command');

            // Closing connection will cause the `run` function to result in an error.
            this.closeConnection(connection);
            resolve(true);
          })
          .catch(e => reject(e));
      } else {
        resolve(false);
      }
    });
  }
}
