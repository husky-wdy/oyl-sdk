export declare class Opi {
    opiUrl: string;
    constructor(opiUrl: string);
    _call(url: any): Promise<any>;
    getBrc20Balance({ address, ticker, }: {
        address: string;
        ticker: string;
    }): Promise<any>;
    getUnspentBRC20ByAddress({ address }: {
        address: string;
    }): Promise<any>;
    getAllUnspentBRC20ByTicker({ ticker }: {
        ticker: string;
    }): Promise<any>;
    getBRC20HoldersByTicker({ ticker }: {
        ticker: string;
    }): Promise<any>;
    getBRC20EventsByInscriptionId({ inscId }: {
        inscId: string;
    }): Promise<any>;
    getUnspentRuneByAddress({ address }: {
        address: string;
    }): Promise<any>;
}
