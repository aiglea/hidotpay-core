import {
  isBitcoinProductNetwork,
  isEvmProductNetwork,
  isTronProductNetwork,
  isXrpProductNetwork,
} from './product-networks.js';
import type { DepositAddressBackend } from './deposit-address-service.js';

export class RoutingDepositBackend implements DepositAddressBackend {
  public constructor(
    private readonly xpub: DepositAddressBackend,
    private readonly tables: DepositAddressBackend,
  ) {}

  public deriveDepositAddress(input: { derivationIndex: number; keyVersion: number; network: string }): Promise<string> {
    if (
      isEvmProductNetwork(input.network)
      || isTronProductNetwork(input.network)
      || isBitcoinProductNetwork(input.network)
      || isXrpProductNetwork(input.network)
    ) {
      return this.xpub.deriveDepositAddress(input);
    }
    return this.tables.deriveDepositAddress(input);
  }
}
