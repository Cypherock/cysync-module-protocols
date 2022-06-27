export enum FlowErrorType {
  UNKNOWN_FLOW_ERROR = 'HD_OPS_5500',

  ADD_COIN_UNKNOWN_ASSET = ''
}

export class FlowError extends Error {
  public errorType: FlowErrorType;
  public metadata: string;
  constructor(errorType: FlowErrorType, metadata?: string) {
    super();
    this.errorType = errorType || FlowErrorType.UNKNOWN_FLOW_ERROR;
    this.metadata = metadata || '';
    Object.setPrototypeOf(this, FlowError.prototype);
  }
}
