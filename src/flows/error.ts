/**
 * This error is used for interupting the flow in between intentionally.
 * This should not be interpretted as an Error.
 *
 * Usage Examples:
 * - When the operation was rejected by the user, throw this error to stop the
 *   flow.
 * - When the operation was rejected due to not found error on device
 *   (like wallet no found etc), throw this error to stop the flow.
 */
export class ExitFlowError extends Error {
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, ExitFlowError.prototype);
  }
}
