import { PacketVersionMap } from '@cypherock/communication';
import { DeviceDb2 } from '@cypherock/database';

import {
  ALL_SUPPORTED_SDK_VERSIONS,
  LATEST_SUPPORTED_SDK_VERSION,
  OLDEST_SUPPORTED_SDK_VERSION
} from '../../config';
import logger from '../../utils/logger';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

const formatSDKVersion = (version: string) => {
  if (version.length < 12) {
    throw new Error('SDK version should be atleast 6 bytes.');
  }

  const major = parseInt(version.slice(0, 4), 16);
  const minor = parseInt(version.slice(4, 8), 16);
  const patch = parseInt(version.slice(8, 12), 16);

  return `${major}.${minor}.${patch}`;
};

export interface GetDeviceInfoRunOptions extends CyFlowRunOptions {
  deviceDB: DeviceDb2;
}

export class GetDeviceInfo extends CyFlow {
  constructor() {
    super();
  }

  async run({ connection, deviceDB }: GetDeviceInfoRunOptions) {
    this.cancelled = false;
    let flowInterupted = false;

    try {
      await this.onStart(connection);

      const packetVersion = await connection.selectPacketVersion();

      logger.info('Working packet version', { packetVersion });

      const ready = await this.deviceReady(connection);

      if (ready) {
        // If the packet version is `v1`, then the sdk version will default to `0.0.0`
        let sdkVersion = '0.0.0';
        if (packetVersion !== PacketVersionMap.v1) {
          await connection.sendData(88, '00');
          const sdkVersionData = await connection.receiveData([88]);

          sdkVersion = formatSDKVersion(sdkVersionData.data);
        }

        this.emit('sdkVersion', sdkVersion);

        if (!ALL_SUPPORTED_SDK_VERSIONS.includes(sdkVersion)) {
          /* `sdkNotSupported` will be emitted with the following parameters:
           * app: If the cysync needs to be updated
           * device: If the device needs to be updated
           * undefined: If we cannot determine the cause. (Both should be updated)
           */
          if (sdkVersion > LATEST_SUPPORTED_SDK_VERSION) {
            this.emit('sdkNotSupported', 'app');
          } else if (sdkVersion < OLDEST_SUPPORTED_SDK_VERSION) {
            this.emit('sdkNotSupported', 'device');
          } else {
            this.emit('sdkNotSupported');
          }
          throw new Error('SDK not supported');
        }

        await connection.sendData(87, '00');
        const data = await connection.receiveData([87]);
        const isAuthenticated = data.data.slice(0, 2);
        const serial = data.data.slice(2, 64 + 2);
        const firmwareVersion = data.data.slice(64 + 2, 64 + 2 + 8);

        const firmwareV = (firmwareVersion + '').toLowerCase();
        this.emit('firmwareVersion', firmwareV);

        if (isAuthenticated === '00') {
          this.emit('auth', false);
          throw new ExitFlowError();
        }

        if (serial.search(/[^0]/) === -1) {
          throw new Error('Invalid Serial returned from device');
        }

        const deviceSerial = (serial + '').toLowerCase();
        this.emit('serial', deviceSerial);

        const dbDevice = await deviceDB.get(deviceSerial);

        if (!dbDevice) {
          this.emit('isNew', true);
          this.emit('auth', false);
          throw new ExitFlowError();
        }

        if (dbDevice.isAuth) {
          this.emit('lastAuth', true);
          this.emit('auth', true);
        } else {
          this.emit('lastAuth', false);
          this.emit('auth', false);
        }
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      if (!(e instanceof ExitFlowError)) {
        flowInterupted = true;
        this.emit('error', e);
      }
    } finally {
      await this.onEnd(connection, {
        dontAbort: !flowInterupted
      });
    }
  }
}
