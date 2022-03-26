import { receiveCommand, sendData } from '@cypherock/communication';

import { CyFlow, CyFlowRunOptions } from '../index';

import { sleep, upgrade } from './helper';

export interface DeviceUpdaterRunOptions extends CyFlowRunOptions {
  firmwareVersion: string;
  firmwarePath: string;
  inBootloaderMode?: boolean;
}

export class DeviceUpdater extends CyFlow {
  constructor() {
    super();
  }

  async run({
    connection,
    packetVersion,
    firmwareVersion,
    firmwarePath,
    inBootloaderMode = false
  }: DeviceUpdaterRunOptions) {
    this.cancelled = false;
    try {
      if (!inBootloaderMode) {
        await this.onStart(connection);

        const ready = await this.deviceReady(connection);

        if (ready) {
          await sendData(connection, 77, firmwareVersion, packetVersion);
          const updateConfirmed = await receiveCommand(
            connection,
            78,
            packetVersion,
            30000
          );

          if (updateConfirmed === '01') {
            this.emit('updateConfirmed', true);
          } else if (updateConfirmed === '00') {
            this.emit('updateConfirmed', false);
            await this.closeConnection(connection);
            return;
          } else {
            this.emit('error');
            await this.closeConnection(connection);
            return;
          }

          await sleep(3000);
        } else {
          this.emit('notReady');
          return;
        }
      } else {
        this.emit('updateConfirmed', true);
      }

      await upgrade(firmwarePath);
      this.emit('completed');
    } catch (e) {
      this.emit('error', e);
    } finally {
      this.removeAllListeners();
    }
  }
}
