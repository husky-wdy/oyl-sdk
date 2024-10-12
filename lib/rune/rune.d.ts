import { Provider } from '../provider/provider';
import { Account } from '../account/account';
import { RuneUTXO } from '../shared/interface';
import { Signer } from '../signer';
export declare const createSendPsbt: ({ account, runeId, provider, inscriptionAddress, toAddress, amount, feeRate, fee, }: {
    account: Account;
    runeId: string;
    provider: Provider;
    inscriptionAddress: string;
    toAddress: string;
    amount: number;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
}>;
export declare const createMintPsbt: ({ account, runeId, provider, feeRate, fee, }: {
    account: Account;
    runeId: string;
    provider: Provider;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
}>;
export declare const createEtchPsbt: ({ account, symbol, cap, premine, perMintAmount, turbo, divisibility, runeName, provider, feeRate, fee, }: {
    account: Account;
    provider: Provider;
    symbol: string;
    cap?: number;
    premine?: number;
    perMintAmount: number;
    turbo?: boolean;
    divisibility?: number;
    runeName: string;
    feeRate?: number;
    fee?: number;
}) => Promise<{
    psbt: string;
}>;
export declare const findRuneUtxos: ({ address, greatestToLeast, provider, runeId, targetNumberOfRunes, }: {
    address: string;
    greatestToLeast: boolean;
    provider: Provider;
    runeId: string;
    targetNumberOfRunes: number;
}) => Promise<{
    runeUtxos: RuneUTXO[];
    runeTotalSatoshis: number;
    divisibility: number;
}>;
export declare const actualSendFee: ({ account, runeId, provider, inscriptionAddress, toAddress, amount, feeRate, signer, }: {
    account: Account;
    runeId: string;
    provider: Provider;
    inscriptionAddress?: string;
    toAddress: string;
    amount: number;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
export declare const actualMintFee: ({ account, runeId, provider, feeRate, signer, }: {
    account: Account;
    runeId: string;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
export declare const actualEtchFee: ({ account, symbol, cap, premine, perMintAmount, turbo, divisibility, runeName, provider, feeRate, signer, }: {
    symbol: string;
    cap?: number;
    premine?: number;
    perMintAmount: number;
    turbo?: boolean;
    divisibility?: number;
    runeName: string;
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
export declare const send: ({ toAddress, amount, runeId, inscriptionAddress, feeRate, account, provider, signer, }: {
    toAddress: string;
    amount: number;
    runeId: string;
    inscriptionAddress?: string;
    feeRate?: number;
    account: Account;
    provider: Provider;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const mint: ({ account, runeId, provider, feeRate, signer, }: {
    account: Account;
    runeId: string;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const etch: ({ symbol, cap, premine, perMintAmount, turbo, divisibility, runeName, account, provider, feeRate, signer, }: {
    symbol: string;
    cap?: number;
    premine?: number;
    perMintAmount: number;
    turbo?: boolean;
    divisibility?: number;
    runeName: string;
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
