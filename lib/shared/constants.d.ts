import { MnemonicToAccountOptions } from '../account';
import { Provider } from '../provider/provider';
import { Network, NetworkOptions } from './interface';
export declare const UTXO_DUST = 546;
export declare const maximumScriptBytes = 520;
export declare const MAXIMUM_FEE = 5000000;
export declare const regtestProvider: Provider;
export declare const regtestOpts: MnemonicToAccountOptions;
export declare const Opts: MnemonicToAccountOptions;
export declare const regtestMnemonic: string;
export declare const mainnetMnemonic: string;
export declare const getBrc20Data: ({ amount, tick, }: {
    amount: number | string;
    tick: string;
}) => {
    mediaContent: string;
    mediaType: string;
};
export declare const defaultNetworkOptions: Record<Network, NetworkOptions>;
