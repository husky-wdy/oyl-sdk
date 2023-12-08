/// <reference types="node" />
import * as bitcoin from 'bitcoinjs-lib';
import { UnspentOutput, TxInput, IBlockchainInfoUTXO, Network, BitcoinPaymentType, ToSignInput } from '../shared/interface';
export interface IBISWalletIx {
    validity: any;
    isBrc: boolean;
    isSns: boolean;
    name: any;
    amount: any;
    isValidTransfer: any;
    operation: any;
    ticker: any;
    isJson: boolean;
    content?: string;
    inscription_name: any;
    inscription_id: string;
    inscription_number: number;
    metadata: any;
    owner_wallet_addr: string;
    mime_type: string;
    last_sale_price: any;
    slug: any;
    collection_name: any;
    content_url: string;
    bis_url: string;
    wallet?: string;
    media_length?: number;
    genesis_ts?: number;
    genesis_height?: number;
    genesis_fee?: number;
    output_value?: number;
    satpoint?: string;
    collection_slug?: string;
    confirmations?: number;
}
export declare const ECPair: import("ecpair").ECPairAPI;
export declare const assertHex: (pubKey: Buffer) => Buffer;
export declare function getNetwork(value: Network): bitcoin.networks.Network;
export declare function checkPaymentType(payment: bitcoin.PaymentCreator, network: Network): (script: Buffer) => false | bitcoin.payments.Payment;
export declare function tweakSigner(signer: bitcoin.Signer, opts?: any): bitcoin.Signer;
export declare function satoshisToAmount(val: number): string;
export declare function delay(ms: number): Promise<unknown>;
export declare function createSegwitSigner({ mnemonic, segwitAddress, hdPathWithIndex, }: {
    mnemonic: string;
    segwitAddress: string;
    hdPathWithIndex: string;
}): Promise<any>;
export declare function createTaprootSigner({ mnemonic, taprootAddress, hdPathWithIndex, }: {
    mnemonic: string;
    taprootAddress: string;
    hdPathWithIndex: string;
}): Promise<any>;
export declare function createSigner({ mnemonic, fromAddress, hdPathWithIndex, }: {
    mnemonic: string;
    fromAddress: string;
    hdPathWithIndex: string;
}): Promise<any>;
export declare function amountToSatoshis(val: any): number;
export declare const validator: (pubkey: Buffer, msghash: Buffer, signature: Buffer) => boolean;
export declare function utxoToInput(utxo: UnspentOutput, publicKey: Buffer): TxInput;
export declare const getWitnessDataChunk: (content: string, encodeType?: BufferEncoding) => Buffer[];
export declare const getUnspentsWithConfirmationsForAddress: (address: string) => Promise<IBlockchainInfoUTXO[]>;
export declare const getUTXOWorthGreatestValueForAddress: (address: string) => Promise<IBlockchainInfoUTXO>;
export declare const getSatpointFromUtxo: (utxo: IBlockchainInfoUTXO) => string;
export declare const getUnspentsForAddressInOrderByValue: (address: string) => Promise<IBlockchainInfoUTXO[]>;
export declare const getInscriptionsByWalletBIS: (walletAddress: string, offset?: number) => Promise<IBISWalletIx[]>;
export declare const getUTXOsToCoverAmount: (address: string, amountNeeded: number, inscriptionLocs?: string[], usedUtxos?: IBlockchainInfoUTXO[]) => Promise<IBlockchainInfoUTXO[]>;
export declare const getUTXOsToCoverAmountWithRemainder: (address: string, amountNeeded: number, inscriptionLocs?: string[]) => Promise<IBlockchainInfoUTXO[]>;
export declare const getTheOtherUTXOsToCoverAmount: (address: string, amountNeeded: number, inscriptionLocs?: string[]) => Promise<IBlockchainInfoUTXO[]>;
export declare const getUTXOByAddressTxIDAndVOut: (address: string, txId: string, vOut: number) => Promise<IBlockchainInfoUTXO>;
export declare function calculateAmountGathered(utxoArray: IBlockchainInfoUTXO[]): number;
export declare const getScriptForAddress: (address: string) => Promise<any>;
export declare const formatOptionsToSignInputs: ({ _psbt, isRevealTx, pubkey, segwitPubkey, segwitAddress, taprootAddress, }: {
    _psbt: bitcoin.Psbt;
    isRevealTx: boolean;
    pubkey: string;
    segwitPubkey: string;
    segwitAddress: string;
    taprootAddress: string;
}) => Promise<ToSignInput[]>;
export declare const signInputs: (psbt: bitcoin.Psbt, toSignInputs: ToSignInput[], taprootPubkey: string, segwitPubKey: string, segwitSigner: any, taprootSigner: any) => Promise<bitcoin.Psbt>;
export declare const inscribe: ({ ticker, amount, inputAddress, outputAddress, mnemonic, taprootPublicKey, segwitPublicKey, segwitAddress, isDry, segwitHdPathWithIndex, taprootHdPathWithIndex, payFeesWithSegwit, feeRate, }: {
    ticker: string;
    amount: number;
    inputAddress: string;
    outputAddress: string;
    mnemonic: string;
    taprootPublicKey: string;
    segwitPublicKey: string;
    segwitAddress: string;
    isDry?: boolean;
    feeRate: number;
    segwitHdPathWithIndex?: string;
    taprootHdPathWithIndex?: string;
    payFeesWithSegwit: boolean;
}) => Promise<any>;
export declare const createInscriptionScript: (pubKey: any, content: any) => any[];
export declare const RPC_ADDR = "https://node.oyl.gg/v1/6e3bc3c289591bb447c116fda149b094";
export declare const callBTCRPCEndpoint: (method: string, params: string | string[]) => Promise<any>;
export declare function waitForTransaction(txId: string): Promise<boolean>;
export declare function getOutputValueByVOutIndex(commitTxId: string, vOut: number): Promise<number | null>;
export declare function calculateTaprootTxSize(taprootInputCount: number, nonTaprootInputCount: number, outputCount: number): number;
export declare function getRawTxnHashFromTxnId(txnId: string): Promise<any>;
export declare const isP2PKH: (script: Buffer, network: Network) => BitcoinPaymentType;
export declare const isP2WPKH: (script: Buffer, network: Network) => BitcoinPaymentType;
export declare const isP2WSHScript: (script: Buffer, network: Network) => BitcoinPaymentType;
export declare const isP2SHScript: (script: Buffer, network: Network) => BitcoinPaymentType;
export declare const isP2TR: (script: Buffer, network: Network) => BitcoinPaymentType;
export declare const sendCollectible: ({ inscriptionId, inputAddress, outputAddress, mnemonic, taprootPublicKey, segwitPublicKey, segwitAddress, isDry, segwitHdPathWithIndex, taprootHdPathWithIndex, payFeesWithSegwit, feeRate, }: {
    inscriptionId: string;
    inputAddress: string;
    outputAddress: string;
    mnemonic: string;
    taprootPublicKey: string;
    segwitPublicKey: string;
    segwitAddress: string;
    isDry?: boolean;
    feeRate: number;
    segwitHdPathWithIndex?: string;
    taprootHdPathWithIndex?: string;
    payFeesWithSegwit: boolean;
}) => Promise<string | {
    error: any;
}>;
