import { CyFlow, CyFlowRunOptions } from '../index';

export interface CancelFlowRunOptions extends CyFlowRunOptions {}

export class CancelFlow extends CyFlow {
  constructor() {
    super();
  }

  async run({ connection }: CancelFlowRunOptions) {
    return await this.cancel(connection);
  }
}
