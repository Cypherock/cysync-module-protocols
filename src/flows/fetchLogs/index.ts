import { hexToAscii, receiveCommand, sendData } from '@cypherock/communication';
import fs from 'fs';

import { CyFlow, CyFlowRunOptions } from '../index';

export interface LogsFetcherRunOptions extends CyFlowRunOptions {
  firmwareVersion: string;
}

export class LogsFetcher extends CyFlow {
  constructor() {
    super();
  }

  async run({
    connection,
    packetVersion,
    firmwareVersion
  }: LogsFetcherRunOptions) {
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
        await sendData(connection, 37, '00', packetVersion);

        const acceptedRequest: any = await receiveCommand(
          connection,
          37,
          packetVersion,
          30000
        );
        if (acceptedRequest === '02') {
          this.emit('loggingDisabled');
          return;
        }

        if (acceptedRequest !== '01') {
          this.emit('acceptedRequest', false);
          return;
        }

        this.emit('acceptedRequest', true);
        await sendData(connection, 38, '00', packetVersion);

        let data: any = '';
        let rawData: any;
        //end of packet in hex with carrige return and line feed.
        while (rawData !== '656e646f667061636b65740d0a') {
          rawData = await receiveCommand(connection, 38, packetVersion, 2000);
          data = hexToAscii(rawData);
          stream.write(data);
        }
        this.emit('completed', true);
      } else {
        this.emit('notReady');
      }
    } catch (e) {
      this.emit('error', e);
      flowInterupted = true;
    } finally {
      stream.end();
      await this.onEnd(connection, packetVersion, {
        dontAbort: !flowInterupted
      });
    }
  }
}
