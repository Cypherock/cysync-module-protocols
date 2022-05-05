import { hexToAscii } from '@cypherock/communication';
import fs from 'fs';

import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

export interface LogsFetcherRunOptions extends CyFlowRunOptions {
  firmwareVersion: string;
}

export class LogsFetcher extends CyFlow {
  constructor() {
    super();
  }

  async run({ connection, firmwareVersion }: LogsFetcherRunOptions) {
    let flowInterupted = false;
    this.cancelled = false;
    const filePath = process.env.userDataPath
      ? process.env.userDataPath + '/CypherockX1.log'
      : 'CypherockX1.log';
    const stream = fs.createWriteStream(filePath, { flags: 'a' });

    stream.write('\n\n****************************************\n\n');
    stream.write('Firmware Version: ' + firmwareVersion + new Date());

    try {
      await this.onStart(connection);

      const ready = await this.deviceReady(connection);

      if (ready) {
        await connection.sendData(37, '00');

        const acceptedRequest = await connection.receiveData([37], 30000);
        if (acceptedRequest.data === '02') {
          this.emit('loggingDisabled');
          throw new ExitFlowError();
        }

        if (acceptedRequest.data !== '01') {
          this.emit('acceptedRequest', false);
          throw new ExitFlowError();
        }

        this.emit('acceptedRequest', true);
        await connection.sendData(38, '00');

        let data: any = '';
        let rawData: string = '';
        //end of packet in hex with carrige return and line feed.
        while (rawData !== '656e646f667061636b65740d0a') {
          const resp = await connection.receiveData([38], 2000);
          rawData = resp.data;
          data = hexToAscii(rawData);
          stream.write(data);
        }
        this.emit('completed', true);
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      if (!(e instanceof ExitFlowError)) {
        flowInterupted = true;
        this.emit('error', e);
      }
    } finally {
      stream.end();
      await this.onEnd(connection, {
        dontAbort: !flowInterupted
      });
    }
  }
}
