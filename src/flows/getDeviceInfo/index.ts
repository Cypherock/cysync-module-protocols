import {
  PacketVersionMap,
  receiveCommand,
  sendData
} from '@cypherock/communication';

import {
  ALL_SUPPORTED_SDK_VERSIONS,
  LATEST_SUPPORTED_SDK_VERSION,
  OLDEST_SUPPORTED_SDK_VERSION
} from '../../config';
import logger from '../../utils/logger';
import { CyFlow, CyFlowRunOptions } from '../index';

import { getPacketVersion } from './helper';

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
  deviceDbUtil: any;
}

export class GetDeviceInfo extends CyFlow {
  constructor() {
    super();
  }

  async run({ connection, deviceDbUtil }: GetDeviceInfoRunOptions) {
    this.cancelled = false;
    let flowInterupted = false;

    try {
      await this.onStart(connection);

      const packetVersion = await getPacketVersion(connection);
      if (!packetVersion) {
        throw new Error('No packet version is working with this device.');
      }

      logger.info('Working packet version', { packetVersion });
      this.emit('packetVersion', packetVersion);

      const ready = await this.deviceReady(connection, packetVersion);

      if (ready) {
        // If the packet version is `v1`, then the sdk version will default to `0.0.0`
        let sdkVersion = '0.0.0';
        if (packetVersion !== PacketVersionMap.v1) {
          await sendData(connection, 88, '00', packetVersion);
          const sdkVersionData: any = await receiveCommand(
            connection,
            88,
            packetVersion
          );

          sdkVersion = formatSDKVersion(sdkVersionData);
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
          return;
        }

        await sendData(connection, 87, '00', packetVersion);
        const data: any = await receiveCommand(connection, 87, packetVersion);
        const isAuthenticated = data.slice(0, 2);
        const serial = data.slice(2, 64 + 2);
        const firmwareVersion = data.slice(64 + 2, 64 + 2 + 8);

        const firmwareV = (firmwareVersion + '').toLowerCase();
        this.emit('firmwareVersion', firmwareV);

        if (isAuthenticated === '00') {
          this.emit('auth', false);
          return;
        }

        if (serial.search(/[^0]/) === -1) {
          throw new Error('Invalid Serial returned from device');
        }

        const deviceSerial = (serial + '').toLowerCase();
        this.emit('serial', deviceSerial);

        const dbDevice = await deviceDbUtil('getBySerial', deviceSerial);

        if (!dbDevice) {
          this.emit('isNew', true);
          this.emit('auth', false);
          return;
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
      this.emit('error', e);
      flowInterupted = true;
    } finally {
      await this.onEnd(connection, PacketVersionMap.v1, {
        dontAbort: !flowInterupted
      });
    }
  }
}
