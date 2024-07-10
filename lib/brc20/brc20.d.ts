/// <reference types="node" />
import { Provider } from '../provider/provider';
import { FormattedUtxo } from '../utxo/utxo';
import { Account } from '../account/account';
import { Signer } from '../signer';
export declare const transferEstimate: ({ toAddress, feeRate, account, provider, fee, }: {
    toAddress: string;
    feeRate: number;
    account: Account;
    provider: Provider;
    fee?: number;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const commit: ({ ticker, amount, feeRate, account, taprootPrivateKey, provider, fee, finalSendFee, }: {
    ticker: string;
    amount: number;
    feeRate: number;
    account: Account;
    taprootPrivateKey: string;
    provider: Provider;
    fee?: number;
    finalSendFee?: number;
}) => Promise<{
    psbt: string;
    fee: number;
    script: Buffer;
}>;
export declare const reveal: ({ receiverAddress, script, feeRate, taprootPrivateKey, provider, fee, commitTxId, }: {
    receiverAddress: string;
    script: Buffer;
    feeRate: number;
    taprootPrivateKey: string;
    provider: Provider;
    fee?: number;
    commitTxId: string;
}) => Promise<{
    psbt: string;
    fee: number;
}>;
export declare const transfer: ({ commitChangeUtxoId, revealTxId, toAddress, feeRate, account, provider, fee, }: {
    commitChangeUtxoId: string;
    revealTxId: string;
    toAddress: string;
    feeRate: number;
    account: Account;
    provider: Provider;
    fee?: number;
}) => Promise<{
    psbt: string;
}>;
export declare const send: ({ ticker, amount, toAddress, account, provider, feeRate, signer, }: {
    ticker: string;
    amount: number;
    toAddress: string;
    feeRate: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTxn: string;
    sendBrc20Txids: string[];
}>;
export declare const addressBRC20Utxos: ({ address, provider, }: {
    address: string;
    provider: Provider;
}) => Promise<{
    totalAmount: number;
    utxos: FormattedUtxo[];
}>;
