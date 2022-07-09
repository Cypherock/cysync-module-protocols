import { PacketVersion, PacketVersionMap } from '@cypherock/communication';
import { DeviceDB } from '@cypherock/database';

import logger from '../../utils/logger';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

export interface GetDeviceInfoRunOptions extends CyFlowRunOptions {
  deviceDB: DeviceDB;
}

export class GetDeviceInfo extends CyFlow {
  constructor() {
    super();
  }

  async runLegacy({
    connection,
    deviceDB
  }: GetDeviceInfoRunOptions & { packetVersion: PacketVersion }) {
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

    const dbDevice = await deviceDB.getBySerial(deviceSerial);

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
  }

  async runOperation({
    connection,
    deviceDB
  }: GetDeviceInfoRunOptions & { packetVersion: PacketVersion }) {
    let sequenceNumber = connection.getNewSequenceNumber();
    await connection.sendCommand({
      commandType: 87,
      data: '00',
      sequenceNumber
    });
    const data = await connection.waitForCommandOutput({
      sequenceNumber,
      expectedCommandTypes: [87],
      onStatus: () => {}
    });

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

    const dbDevice = await deviceDB.getBySerial(deviceSerial);

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
  }

  async run(params: GetDeviceInfoRunOptions) {
    const { connection } = params;
    this.cancelled = false;
    let flowInterupted = false;

    try {
      await this.onStart(connection);

      const { sdkVersion, isSupported, isNewer } =
        await connection.isDeviceSupported();

      this.emit('sdkVersion', sdkVersion);

      if (!isSupported) {
        /* `sdkNotSupported` will be emitted with the following parameters:
         * app: If the cysync needs to be updated
         * device: If the device needs to be updated
         * undefined: If we cannot determine the cause. (Both should be updated)
         */
        if (isNewer) {
          this.emit('sdkNotSupported', 'app');
        } else {
          this.emit('sdkNotSupported', 'device');
        }

        throw new Error('SDK not supported');
      }

      const packetVersion = connection.getPacketVersion();

      logger.info('Working packet version', { packetVersion });

      const ready = await this.deviceReady(connection);

      if (ready) {
        if (packetVersion === PacketVersionMap.v3) {
          await this.runOperation({ ...params, packetVersion });
        } else {
          await this.runLegacy({ ...params, packetVersion });
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
