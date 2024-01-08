import { assertHex, getSatpointFromUtxo } from "../shared/utils";
import { getAddressType } from "../transactions";
import { MarketplaceBuy, AddressType } from "../shared/interface";
import * as bitcoin from "bitcoinjs-lib";

export class BuildMarketplaceTransaction {
    public walletAddress: string;
    public pubKey: string;
    public api;
    public esplora;
    public psbtBase64: string;
    public orderPrice: number;
    public sandshrew;
    public makersAddress: string | null;
    public takerScript: string;
    public network: bitcoin.Network

    constructor({ address, pubKey, psbtBase64, price, wallet }: MarketplaceBuy) {
        this.walletAddress = address;
        this.pubKey = pubKey;
        /** should resolve values below based on network passed */
        this.api = wallet.apiClient
        this.esplora = wallet.esploraRpc
        this.sandshrew = wallet.sandshrewBtcClient;
        this.psbtBase64 = psbtBase64;
        this.orderPrice = price;
        this.network = wallet.network
        const tapInternalKey = assertHex(Buffer.from(this.pubKey, "hex"));
        const p2tr = bitcoin.payments.p2tr({
            internalPubkey: tapInternalKey,
            network: this.network,
        });
        const addressType = getAddressType(this.walletAddress);
        if (addressType == AddressType.P2TR) {
            this.takerScript = p2tr.output?.toString("hex");
        } else {
            throw Error("Can only get script for taproot addresses");
        }
    }

    async getUTXOsToCoverAmount(
        amountNeeded: number,
        inscriptionLocs?: string[]
    ) {
        console.log(
            "=========== Getting Unspents for address in order by value ========"
        );
        const unspentsOrderedByValue =
            await this.getUnspentsForAddressInOrderByValue();
        console.log("unspentsOrderedByValue:", unspentsOrderedByValue);
        console.log(
            "=========== Getting Collectibles for address " +
            this.walletAddress +
            "========"
        );
        const retrievedIxs = (
            await this.api.getCollectiblesByAddress(this.walletAddress)
        ).data;
        console.log("=========== Collectibles:", retrievedIxs);
        console.log("=========== Gotten Collectibles, splitting utxos ========");
        const bisInscriptionLocs = retrievedIxs.map(
            (utxo) => utxo.satpoint
        ) as string[];

        if (bisInscriptionLocs.length === 0) {
            inscriptionLocs = [];
        } else {
            inscriptionLocs = bisInscriptionLocs;
        }

        let sum = 0;
        const result: any = [];
        console.log("=========== Available inscription utxos: ", inscriptionLocs);
        for await (let utxo of unspentsOrderedByValue) {
            const currentUTXO = utxo;
            const utxoSatpoint = getSatpointFromUtxo(currentUTXO);
            if (
                (inscriptionLocs &&
                    inscriptionLocs?.find((utxoLoc: any) => utxoLoc === utxoSatpoint)) ||
                currentUTXO.value <= 546
            ) {
                continue;
            }
            sum += currentUTXO.value;
            result.push(currentUTXO);
            console.log("sum", sum)
            console.log("amount needed", amountNeeded)
            if (sum > amountNeeded) {
                console.log("AMOUNT RETRIEVED: ", sum);
                return result;
            }
        }

        return [];
    }

    async isWalletPrepared() {
        const allUtxosWorth600 = await this.getAllUTXOsWorthASpecificValue(600);
        console.log("=========== UTXOs worth 600 sats: ", allUtxosWorth600);
        if (allUtxosWorth600.length < 2) {
            return false;
        }
        return true
    }

    async prepareWallet() {
        const requiredSatoshis = 30000 + 1200;
        const retrievedUtxos = await this.getUTXOsToCoverAmount(requiredSatoshis);
        if (retrievedUtxos.length === 0) {
            throw Error("Not enough funds to prepare address utxos");
        }
        const prepareTx = new bitcoin.Psbt({network: this.network});
        console.log("=========== Retreived Utxos to add: ", retrievedUtxos);
        for (let i = 0; i < retrievedUtxos.length; i++) {
            prepareTx.addInput({
                hash: retrievedUtxos[i].txid,
                index: retrievedUtxos[i].vout,
                witnessUtxo: {
                    value: retrievedUtxos[i].value,
                    script: Buffer.from(this.takerScript, "hex"),
                },
                tapInternalKey: assertHex(Buffer.from(this.pubKey, "hex")),
            });
        }
        const amountRetrieved = this.calculateAmountGathered(retrievedUtxos);
        const remainder = amountRetrieved - 30000 - 1200;
        prepareTx.addOutput({
            address: this.walletAddress,
            value: 600,
        });
        prepareTx.addOutput({
            address: this.walletAddress,
            value: 600,
        });
        prepareTx.addOutput({
            address: this.walletAddress,
            value: remainder,
        });

        return {
            psbtHex: prepareTx.toHex(),
            psbtBase64: prepareTx.toBase64(),
            remainder,
        }
    }

    async checkAffordability(costEstimate) {
        const retrievedUtxos = await this.getUTXOsToCoverAmount(costEstimate);
        if (retrievedUtxos.length === 0) {
            return false;
        }
        return true
    }

    async psbtBuilder() {
        console.log("=========== Decoding PSBT with bitcoinjs ========");
        const marketplacePsbt = bitcoin.Psbt.fromBase64(this.psbtBase64, {network: this.network});
        const costPrice = this.orderPrice;
        const requiredSatoshis = costPrice + 30000 + 546 + 1200;
        const retrievedUtxos = await this.getUTXOsToCoverAmount(requiredSatoshis);
        if (retrievedUtxos.length === 0) {
            throw Error("Not enough funds to purchase this offer");
        }

        console.log("=========== Getting UTXOS Worth 600 sats ========");
        const allUtxosWorth600 = await this.getAllUTXOsWorthASpecificValue(600);
        console.log("=========== UTXOs worth 600 sats: ", allUtxosWorth600);
        if (allUtxosWorth600.length < 2) {
            throw Error("not enough padding utxos (600 sat) for marketplace buy");
        }

        console.log("=========== Getting Maker's Address ========");
        await this.getMakersAddress();
        console.log("=========== Makers Address: ", this.makersAddress);
        if (!this.makersAddress) {
            throw Error("Could not resolve maker's address");
        }

        console.log("=========== Creating Inputs ========");
        const swapPsbt = new bitcoin.Psbt({network: this.network});
        console.log("=========== Adding dummy utxos ========");

        for (let i = 0; i < 2; i++) {
            swapPsbt.addInput({
                hash: allUtxosWorth600[i].txid,
                index: allUtxosWorth600[i].vout,
                witnessUtxo: {
                    value: allUtxosWorth600[i].value,
                    script: Buffer.from(this.takerScript, "hex"),
                },
                tapInternalKey: assertHex(Buffer.from(this.pubKey, "hex")),
            });
        }

        console.log("=========== Fetching Maker Input Data ========");
        const decoded = await this.sandshrew.bitcoindRpc.decodePSBT(
            this.psbtBase64
        );
        console.log("maker offer txid", decoded.tx.vin[2].txid)
        const makerInputData = marketplacePsbt.data.inputs[2];
        console.log("=========== Maker Input Data: ", makerInputData);
        swapPsbt.addInput({
            hash: decoded.tx.vin[2].txid,
            index: 0,
            witnessUtxo: {
                value: makerInputData?.witnessUtxo?.value,
                script: makerInputData?.witnessUtxo?.script as Buffer,
            },
            tapInternalKey: makerInputData.tapInternalKey,
            tapKeySig: makerInputData.tapKeySig,
            sighashType:
                bitcoin.Transaction.SIGHASH_SINGLE |
                bitcoin.Transaction.SIGHASH_ANYONECANPAY,
        });

        console.log(
            "=========== Adding available non ordinal UTXOS as input ========"
        );
        console.log("=========== Retreived Utxos to add: ", retrievedUtxos);
        for (let i = 0; i < retrievedUtxos.length; i++) {
            swapPsbt.addInput({
                hash: retrievedUtxos[i].txid,
                index: retrievedUtxos[i].vout,
                witnessUtxo: {
                    value: retrievedUtxos[i].value,
                    script: Buffer.from(this.takerScript, "hex"),
                },
                tapInternalKey: assertHex(Buffer.from(this.pubKey, "hex")),
            });
        }

        console.log("=========== Done Inputs now adding outputs ============");
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: 1200,
        });
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: 546,
        });
        swapPsbt.addOutput({
            address: this.makersAddress,
            value: costPrice,
        });
        const amountRetrieved = this.calculateAmountGathered(retrievedUtxos);
        const remainder = amountRetrieved - costPrice - 30000 - 546 - 1200;
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: 600,
        });
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: 600,
        });
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: remainder,
        });
        console.log("=========== Returning unsigned PSBT ============");
        return {
            psbtHex: swapPsbt.toHex(),
            psbtBase64: swapPsbt.toBase64(),
            remainder,
        };
    }

    async psbtMultiBuilder(previousOrderTxId, remainingSats: number) {
        const requiredSatoshis = this.orderPrice + 30000 + 546 + 1200
        if (!(remainingSats > requiredSatoshis)) {
            throw new Error("Not enough satoshi to complete purchase")
        }
        const marketplacePsbt = bitcoin.Psbt.fromBase64(this.psbtBase64, {network: this.network});
        const swapPsbt = new bitcoin.Psbt({network: this.network});

        swapPsbt.addInput({
            hash: previousOrderTxId,
            index: 3,
            witnessUtxo: {
                value: 600,
                script: Buffer.from(this.takerScript, "hex"),
            },
            tapInternalKey: assertHex(Buffer.from(this.pubKey, "hex")),
        });
        swapPsbt.addInput({
            hash: previousOrderTxId,
            index: 4,
            witnessUtxo: {
                value: 600,
                script: Buffer.from(this.takerScript, "hex"),
            },
            tapInternalKey: assertHex(Buffer.from(this.pubKey, "hex")),
        });
        console.log("=========== Getting Maker's Address ========");
        await this.getMakersAddress();
        console.log("=========== Makers Address: ", this.makersAddress);
        if (!this.makersAddress) {
            throw Error("Could not resolve maker's address");
        }
        const decoded = await this.sandshrew.bitcoindRpc.decodePSBT(
            this.psbtBase64
        );
        const makerInputData = marketplacePsbt.data.inputs[2];
        const neededSats = marketplacePsbt.txOutputs[2].value;
        swapPsbt.addInput({
            hash: decoded.tx.vin[2].txid,
            index: 0,
            witnessUtxo: {
                value: makerInputData?.witnessUtxo?.value as number,
                script: makerInputData?.witnessUtxo?.script as Buffer,
            },
            tapInternalKey: makerInputData.tapInternalKey,
            tapKeySig: makerInputData.tapKeySig,
            sighashType:
                bitcoin.Transaction.SIGHASH_SINGLE |
                bitcoin.Transaction.SIGHASH_ANYONECANPAY,
        });
        swapPsbt.addInput({
            hash: previousOrderTxId,
            index: 5,
            witnessUtxo: {
                value: remainingSats,
                script: Buffer.from(this.takerScript, "hex"),
            },
            tapInternalKey: assertHex(Buffer.from(this.pubKey, "hex")),
        });
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: 1200,
        });
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: 546,
        });
        swapPsbt.addOutput({
            address: this.makersAddress,
            value: neededSats,
        });
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: 600,
        });
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: 600,
        });
        const remainder = remainingSats - neededSats - 30000 - 546 - 1200;
        swapPsbt.addOutput({
            address: this.walletAddress,
            value: remainder,
        });
        return {
            psbtHex: swapPsbt.toHex(),
            psbtBase64: swapPsbt.toBase64(),
            remainingSats: remainder,
        };
    }

    async getAllUTXOsWorthASpecificValue(value: number) {
        const unspents = await this.getUnspentsForAddress();
        console.log("=========== Confirmed/Unconfirmed Utxos", unspents);
        return unspents.filter((utxo) => utxo.value === value);
    }

    calculateAmountGathered(utxoArray: any) {
        return utxoArray?.reduce(
            (prev, currentValue) => prev + currentValue.value,
            0
        );
    }

    async getUnspentsForAddress() {
        try {
            "=========== Getting all confirmed/unconfirmed utxos for " +
                this.walletAddress +
                " ============";
            return await this.esplora.getAddressUtxo(this.walletAddress)
                .then((unspents) =>
                    unspents?.filter((utxo) => utxo.status.confirmed == true || utxo.status.confirmed == false)
                );
        } catch (e: any) {
            throw new Error(e);
        }
    }

    async getUnspentsForAddressInOrderByValue() {
        const unspents = await this.getUnspentsForAddress();
        console.log("=========== Confirmed Utxos", unspents);
        return unspents.sort((a, b) => b.value - a.value);
    }

    async getMakersAddress() {
        const swapTx = await this.sandshrew.bitcoindRpc.decodePSBT(this.psbtBase64);
        const outputs = swapTx.tx.vout;
        console.log("outputs", outputs);
        for (var i = 0; i < outputs.length; i++) {
            if (outputs[i].value == (this.orderPrice / 100000000)) {
                this.makersAddress = outputs[i].scriptPubKey.address;
            }
        }
    }
}
