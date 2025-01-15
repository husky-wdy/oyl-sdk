import { IRpcMethods } from '../shared/interface';
export declare class SandshrewBitcoinClient {
    apiUrl: string;
    bitcoindRpc: IRpcMethods;
    constructor(apiUrl: any);
    _call(method: any, params?: any[], timeout?: number): Promise<any>;
    getBlockTimeByHeight(blockHeight: number): Promise<any>;
    multiCall(parameters: (string | string[])[][]): Promise<any>;
    _initializeRpcMethods(): void;
    _createRpcMethod(methodName: any, argType: any): void;
    _convertArg(arg: any, argType: any): any;
}
