import { CyFlow, ExitFlowError } from '../flows';

export enum WalletStates {
  NO_WALLET_FOUND = 0,
  WALLET_PARTIAL_STATE = 1,
  WALLET_NOT_PRESENT = 2
}

export const commandHandler76 = (
  data: { data: string; commandType: number },
  flow: CyFlow
) => {
  if (data.data.startsWith('00')) {
    // Wallet does not exist
    flow.emit('noWalletFound', WalletStates.NO_WALLET_FOUND);
  } else if (data.data.startsWith('01')) {
    // Wallet is in partial state
    flow.emit('noWalletFound', WalletStates.WALLET_PARTIAL_STATE);
  } else if (data.data.startsWith('02')) {
    flow.emit('noWalletFound', WalletStates.WALLET_NOT_PRESENT);
  }
  throw new ExitFlowError();
};
