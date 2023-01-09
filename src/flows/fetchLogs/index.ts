import { hexToAscii } from '@cypherock/communication';
import fs from 'fs';

import { CyFlow, CyFlowRunOptions, ExitFlowError } from '../index';

export interface LogsFetcherRunOptions extends CyFlowRunOptions {
  firmwareVersion: string;
}

enum LOGS_FETCHER_STATUS {
  START_COMMAND = 1
}

export class LogsFetcher extends CyFlow {
  constructor() {
    super();
  }

  async runOperation({
    connection,
    stream
  }: LogsFetcherRunOptions & { stream: fs.WriteStream }) {
    let data: any = '';
    let rawData: string = '';
    let requestAcceptedState = 0;

    //end of packet in hex with carrige return and line feed.
    while (rawData.toLowerCase() !== '656e646f667061636b65740d0a') {
      const sequenceNumber = connection.getNewSequenceNumber();
      await connection.sendCommand({
        commandType: 38,
        data: '00',
        sequenceNumber
      });
      const resp = await connection.waitForCommandOutput({
        expectedCommandTypes: [37, 38],
        sequenceNumber,
        onStatus: status => {
          if (
            status.flowStatus >= LOGS_FETCHER_STATUS.START_COMMAND &&
            requestAcceptedState === 0
          ) {
            requestAcceptedState = 1;
          }

          if (requestAcceptedState === 1) {
            requestAcceptedState = 2;
            this.emit('acceptedRequest', true);
          }
        }
      });

      if (resp.commandType === 37) {
        if (resp.data === '02') {
          this.emit('loggingDisabled');
          throw new ExitFlowError();
        }

        if (resp.data !== '01') {
          this.emit('acceptedRequest', false);
          throw new ExitFlowError();
        }
      }

      rawData = resp.data;
      data = hexToAscii(rawData);
      stream.write(data);
    }
    this.emit('completed', true);
  }

  async run(params: LogsFetcherRunOptions) {
    const { connection, firmwareVersion } = params;

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
        await this.runOperation({ ...params, stream });
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
