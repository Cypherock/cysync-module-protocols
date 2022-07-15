import { createPort, DeviceConnection } from '@cypherock/communication';

import { CyFlow, CyFlowRunOptions } from '../index';

export interface CancelFlowRunOptions
  extends Omit<CyFlowRunOptions, 'connection'> {
  connection?: DeviceConnection;
}

export class CancelFlow extends CyFlow {
  constructor() {
    super();
  }

  async run({ connection }: CancelFlowRunOptions) {
    // If there is no device connection
    // Try to create a connection and abort
    if (!connection) {
      const { connection: newConnection } = await createPort();

      if (!newConnection.inBootloader) {
        await newConnection.isDeviceSupported();
      }

      await newConnection.beforeOperation();
      return await this.cancel(newConnection);
    }

    return await this.cancel(connection);
  }
}
