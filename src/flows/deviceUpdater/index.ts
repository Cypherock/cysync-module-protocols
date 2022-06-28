import { PacketVersionMap } from '@cypherock/communication';
import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

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
    firmwareVersion,
    firmwarePath,
    inBootloaderMode = false
  }: DeviceUpdaterRunOptions) {
    this.cancelled = false;
    let flowInterupted = false;

    try {
      if (!inBootloaderMode) {
        await this.onStart(connection);

        const ready = await this.deviceReady(connection);

        if (ready) {
          const packetVersion = connection.getPacketVersion();
          let isConfirmed = false;

          if (packetVersion === PacketVersionMap.v3) {
            const sequenceNumber = connection.getNewSequenceNumber();
            await connection.sendCommand({
              commandType: 77,
              data: firmwareVersion,
              sequenceNumber
            });
            const updateConfirmed = await connection.waitForCommandOutput({
              sequenceNumber,
              expectedCommandTypes: [78],
              onStatus: () => {}
            });
            isConfirmed = updateConfirmed.data.startsWith('01');
          } else {
            await connection.sendData(77, firmwareVersion);
            const updateConfirmed = await connection.receiveData([78]);
            isConfirmed = updateConfirmed.data.startsWith('01');
          }

          if (isConfirmed) {
            this.emit('updateConfirmed', true);
          } else {
            this.emit('updateConfirmed', false);
            throw new ExitFlowError();
          }

          await sleep(3000);
        } else {
          this.emit('notReady');
          throw new ExitFlowError();
        }
      } else {
        this.emit('updateConfirmed', true);
      }

      await upgrade(connection, firmwarePath);
      this.emit('completed');
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
