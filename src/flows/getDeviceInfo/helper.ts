import {
  PacketVersion,
  PacketVersionList,
  receiveCommand,
  sendData
} from '@cypherock/communication';
import SerialPort from 'serialport';

import logger from '../../utils/logger';

const testPacketVersion = async (
  connection: SerialPort,
  version: PacketVersion
) => {
  return new Promise(async resolve => {
    try {
      logger.info(`Checking if packet version ${version} works`);

      await sendData(connection, 41, '00', version, 2);
      receiveCommand(connection, 42, version, 2000)
        .then(() => {
          resolve(true);
        })
        .catch(error => {
          if (error) {
            resolve(false);
          }
        });
    } catch (error) {
      resolve(false);
    }
  });
};

export const getPacketVersion = (connection: SerialPort) => {
  return new Promise<PacketVersion | undefined>(async (resolve, reject) => {
    try {
      if (!connection.isOpen) {
        throw new Error('Connection was not open');
      }

      let workingPacketVersion: PacketVersion | undefined;

      const versionList = [...PacketVersionList].reverse();

      for (const packet of versionList) {
        const isWorking = await testPacketVersion(connection, packet);
        if (isWorking) {
          workingPacketVersion = packet;
          break;
        }
      }

      resolve(workingPacketVersion);
    } catch (error) {
      reject(error);
    }
  });
};
