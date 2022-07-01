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
          await connection.sendData(77, firmwareVersion);
          const updateConfirmed = await connection.receiveData([78]);

          if (updateConfirmed.data === '01') {
            this.emit('updateConfirmed', true);
          } else if (updateConfirmed.data === '00') {
            this.emit('updateConfirmed', false);
            throw new ExitFlowError();
          } else {
            this.emit('error');
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

      await upgrade(connection, firmwarePath, progress =>
        this.emit('progress', progress)
      );
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
