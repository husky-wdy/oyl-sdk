import { UTXO_DUST, defaultNetworkOptions } from './shared/constants'
import * as ecc2 from '@cmdcode/crypto-utils'

import { findUtxosToCoverAmount, OGPSBTTransaction, Utxo } from './txbuilder'

import {
  delay,
  getNetwork,
  isValidJSON,
  waitForTransaction,
  formatOptionsToSignInputs,
  signInputs,
  calculateTaprootTxSize,
  calculateAmountGatheredUtxo,
  filterTaprootUtxos,
  formatInputsToSign,
  insertBtcUtxo,
  addressTypeMap,
  inscriptionSats,
  createInscriptionScript,
  getOutputValueByVOutIndex,
  tweakSigner,
  assertHex,
} from './shared/utils'

import { SandshrewBitcoinClient } from './rpclient/sandshrew'
import { EsploraRpc } from './rpclient/esplora'
import * as transactions from './transactions'
import { publicKeyToAddress } from './wallet/accounts'
import { accounts } from './wallet'
import { AccountManager, customPaths } from './wallet/accountsManager'

import {
  AddressType,
  HistoryTx,
  HistoryTxBrc20Inscription,
  HistoryTxCollectibleInscription,
  IBlockchainInfoUTXO,
  InscriptionType,
  Providers,
  RecoverAccountOptions,
  TickerDetails,
  ToSignInput,
  addressTypeToName,
} from './shared/interface'
import { OylApiClient } from './apiclient'
import * as bitcoin from 'bitcoinjs-lib'
import { Provider } from './rpclient/provider'
import { OrdRpc } from './rpclient/ord'
import { HdKeyring } from './wallet/hdKeyring'
import { getAddressType } from './transactions'
import { Signer } from './signer'
import { Address, Tap, Tx } from '@cmdcode/tapscript'
import * as cmdcode from '@cmdcode/tapscript'
import { toXOnly } from 'bitcoinjs-lib/src/psbt/bip371'
import { tweakPubKey } from '@cmdcode/tapscript/dist/types/lib/tap/tweak'

export const NESTED_SEGWIT_HD_PATH = "m/49'/0'/0'/0"
export const TAPROOT_HD_PATH = "m/86'/0'/0'/0"
export const SEGWIT_HD_PATH = "m/84'/0'/0'/0"
export const LEGACY_HD_PATH = "m/44'/0'/0'/0"

const RequiredPath = [
  LEGACY_HD_PATH,
  NESTED_SEGWIT_HD_PATH,
  SEGWIT_HD_PATH,
  TAPROOT_HD_PATH,
]

export class Oyl {
  private mnemonic: String
  private wallet
  public network: bitcoin.Network
  public sandshrewBtcClient: SandshrewBitcoinClient
  public esploraRpc: EsploraRpc
  public ordRpc: OrdRpc
  public provider: Providers
  public apiClient: OylApiClient
  public derivPath: String
  public currentNetwork: 'testnet' | 'main' | 'regtest'

  /**
   * Initializes a new instance of the Wallet class.
   */
  constructor(opts = defaultNetworkOptions.mainnet) {
    const options = {
      ...defaultNetworkOptions[opts.network],
      ...opts,
    }

    const apiKey = options.projectId

    this.apiClient = new OylApiClient({
      host: 'https://api.oyl.gg',
      testnet: options.network == 'testnet' ? true : null,
      apiKey: apiKey,
    })
    const rpcUrl = `${options.baseUrl}/${options.version}/${options.projectId}`
    const provider = new Provider(rpcUrl)
    this.network = getNetwork(options.network)
    this.sandshrewBtcClient = provider.sandshrew
    this.esploraRpc = provider.esplora
    this.ordRpc = provider.ord
    this.currentNetwork =
      options.network === 'mainnet' ? 'main' : options.network
  }

  /**
   * Gets a summary of the given address(es).
   * @param {string | string[]} address - A single address or an array of addresses.
   * @returns {Promise<Object[]>} A promise that resolves to an array of address summaries.
   */
  async getAddressSummary({
    address,
    includeInscriptions,
  }: {
    address: string
    includeInscriptions?: boolean
  }) {
    const addressesUtxo = {}
    let utxos = await this.getUtxos(address, includeInscriptions)
    addressesUtxo['utxos'] = utxos.unspent_outputs
    addressesUtxo['balance'] = transactions.calculateBalance(
      utxos.unspent_outputs
    )

    return addressesUtxo
  }

  /**
   * Derives a Taproot address from the given public key.
   * @param {string} publicKey - The public key to derive the address from.
   * @returns {string} A promise that resolves to the derived Taproot address.
   */
  getTaprootAddress({ publicKey }) {
    try {
      const address = publicKeyToAddress(
        publicKey,
        AddressType.P2TR,
        this.network
      )
      return address
    } catch (err) {
      return err
    }
  }

  /**
   * Retrieves details for a specific BRC-20 token associated with the given address.
   * @param {string} address - The address to query BRC-20 token details from.
   * @param {string} ticker - The ticker symbol of the BRC-20 token to retrieve details for.
   * @returns {Promise<TickerDetails>} A promise that resolves to the details of the specified BRC-20 token.
   */
  async getSingleBrcTickerDetails(
    address: string,
    ticker: string
  ): Promise<TickerDetails> {
    const response = await this.apiClient.getBrc20sByAddress(address)
    const tickerDetails = response.data.find(
      (details) => details.ticker.toLowerCase() === ticker.toLowerCase()
    )
    return tickerDetails
  }

  /**
   * Initializes a wallet from a mnemonic phrase with the specified parameters.
   * @param {Object} options - The options object.
   * @param {string} options.mnemonic - The mnemonic phrase used to initialize the wallet.
   * @param {string} [options.type='taproot'] - The type of wallet to create. Options are 'taproot', 'segwit', 'legacy'.
   * @param {string} [options.hdPath=RequiredPath[3]] - The HD path to derive addresses from.
   * @returns {Promise<any>} A promise that resolves to the wallet data including keyring and assets.
   * @throws {Error} Throws an error if initialization fails.
   */
  async fromPhrase({
    mnemonic,
    addrType = AddressType.P2TR,
    hdPath = RequiredPath[3],
  }) {
    try {
      const wallet = await accounts.importMnemonic(
        mnemonic,
        hdPath,
        addrType,
        this.network
      )

      this.wallet = wallet
      const data = {
        keyring: wallet,
      }
      this.mnemonic = mnemonic
      return data
    } catch (err) {
      return err
    }
  }

  /**
   * Recovers a wallet using the given options.
   * @param {RecoverAccountOptions} options - Options necessary for account recovery.
   * @returns {Promise<any>} A promise that resolves to the recovered wallet payload.
   * @throws {Error} Throws an error if recovery fails.
   */
  async recoverWallet(options: Omit<RecoverAccountOptions, 'network'>) {
    try {
      const wallet = new AccountManager({ ...options, network: this.network })
      const walletPayload = await wallet.recoverAccounts()
      return walletPayload
    } catch (error) {
      return error
    }
  }

  /**
   * Adds a new account to the wallet using the given options.
   * @param {RecoverAccountOptions} options - Options describing the account to be added.
   * @returns {Promise<any>} A promise that resolves to the payload of the newly added account.
   * @throws {Error} Throws an error if adding the account fails.
   */
  async addAccountToWallet(options: Omit<RecoverAccountOptions, 'network'>) {
    try {
      const wallet = new AccountManager({ ...options, network: this.network })
      const walletPayload = await wallet.addAccount()
      return walletPayload
    } catch (error) {
      return error
    }
  }

  /**
   * Initializes a new Oyl account with taproot & segwit HDKeyrings  within the wallet.
   * @returns {Promise<any>} A promise that resolves to the payload of the initialized accounts.
   * @throws {Error} Throws an error if the initialization fails.
   */
  async initializeWallet() {
    try {
      const wallet = new AccountManager({
        network: this.network,
        customPath: this.network == getNetwork('testnet') ? 'testnet' : null,
      })
      const walletPayload = await wallet.initializeAccounts()
      return walletPayload
    } catch (error) {
      return error
    }
  }

  /**
   * Derives a SegWit address from a given public key.
   * @param {Object} param0 - An object containing the public key.
   * @param {string} param0.publicKey - The public key to derive the SegWit address from.
   * @returns {Promise<string>} A promise that resolves to the derived SegWit address.
   * @throws {Error} Throws an error if address derivation fails.
   */
  async getSegwitAddress({ publicKey }) {
    const address = publicKeyToAddress(
      publicKey,
      AddressType.P2WPKH,
      this.network
    )
    return address
  }

  /**
   * Creates a new Oyl with an optional specific derivation type.
   * @param {object} param0 - Object containing the type of derivation.
   * @param {string} [param0.type] - Optional type of derivation path.
   * @returns {{keyring: HdKeyring, address: string}} The newly created wallet object.
   */
  createWallet({ type }: { type?: String }) {
    try {
      let hdPath
      let addrType

      switch (type) {
        case 'taproot':
          addrType = AddressType.P2TR
          hdPath = RequiredPath[3]
          break
        case 'segwit':
          addrType = AddressType.P2WPKH
          hdPath = RequiredPath[2]
          break
        case 'nested-segwit':
          addrType = AddressType.P2SH_P2WPKH
          hdPath = RequiredPath[1]
        case 'legacy':
          addrType = AddressType.P2PKH
          hdPath = RequiredPath[0]
          break
        default:
          addrType = AddressType.P2TR
          hdPath = RequiredPath[3]
          break
      }

      const wallet = accounts.createWallet(hdPath, addrType, this.network)
      return wallet
    } catch (err) {
      return err
    }
  }

  /**
   * Fetches the balance details including confirmed and pending amounts for a given address.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address for which to fetch balance details.
   * @returns {Promise<any>} A promise that resolves to an object containing balance and its USD value.
   * @throws {Error} Throws an error if the balance retrieval fails.
   */
  async getTaprootBalance({ address }: { address: string }) {
    const balance = await this.apiClient.getTaprootBalance(address)
    return balance
  }

  async getUtxos(address: string, includeInscriptions: boolean = true) {
    const utxosResponse: any[] = await this.esploraRpc.getAddressUtxo(address)
    const formattedUtxos: IBlockchainInfoUTXO[] = []

    let filtered = utxosResponse
    if (!includeInscriptions) {
      filtered = utxosResponse.filter((utxo) => utxo.value > 546)
    }

    for (const utxo of filtered) {
      if (utxo.txid) {
        const transactionDetails = await this.esploraRpc.getTxInfo(utxo.txid)
        const voutEntry = transactionDetails.vout.find(
          (v) => v.scriptpubkey_address === address
        )

        formattedUtxos.push({
          tx_hash_big_endian: utxo.txid,
          tx_output_n: utxo.vout,
          value: utxo.value,
          confirmations: utxo.status.confirmed ? 3 : 0,
          script: voutEntry.scriptpubkey,
          tx_index: 0,
        })
      }
    }

    return { unspent_outputs: formattedUtxos }
  }

  /**
   * Retrieves the transaction history for a given address and processes the transactions.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address for which to fetch transaction history.
   * @returns {Promise<any[]>} A promise that resolves to an array of processed transaction details.
   * @throws {Error} Throws an error if transaction history retrieval fails.
   */
  async getTxHistory({ addresses }: { addresses: string[] }) {
    try {
      if (addresses.length > 2) {
        throw new Error('Only accepts a max of 2 addresses')
      }
      const utxoPromises = addresses.map((address: string, index: number) =>
        this.esploraRpc._call('esplora_address::txs', [address])
      )
      const currentBlock = await this.esploraRpc._call(
        'esplora_blocks:tip:height',
        []
      )
      const resolvedUtxoPromises = await Promise.all(utxoPromises)
      const combinedHistory = resolvedUtxoPromises.flat()
      const removedDuplicatesArray = new Map(
        combinedHistory.map((item) => [item.txid, item])
      )
      const finalCombinedHistory = Array.from(removedDuplicatesArray.values())
      const processedTxns = finalCombinedHistory.map((tx) => {
        const { txid, vout, size, vin, status, fee } = tx
        const blockDelta = currentBlock - status.block_height + 1
        const confirmations = blockDelta > 0 ? blockDelta : 0
        const inputAddress = vin.find(
          ({ prevout }) =>
            prevout.scriptpubkey_address === addresses[0] ||
            prevout.scriptpubkey_address === addresses[1]
        )

        let vinSum: number = 0
        let voutSum: number = 0

        for (let input of vin) {
          if (addresses.includes(input.prevout.scriptpubkey_address)) {
            vinSum += input.prevout.value
          }
        }
        for (let output of vout) {
          if (addresses.includes(output.scriptpubkey_address)) {
            voutSum += output.value
          }
        }

        const txDetails = {}
        txDetails['txId'] = txid
        txDetails['confirmations'] = confirmations
        txDetails['type'] = inputAddress ? 'sent' : 'received'
        txDetails['blockTime'] = status.block_time
        txDetails['blockHeight'] = status.block_height
        txDetails['fee'] = fee
        txDetails['feeRate'] = Math.floor(fee / size)
        txDetails['vinSum'] = vinSum
        txDetails['voutSum'] = voutSum
        txDetails['amount'] = inputAddress ? vinSum - voutSum - fee : voutSum
        txDetails['symbol'] = 'BTC'

        return txDetails
      })

      return processedTxns
    } catch (error) {
      console.log(error)
      throw new Error('Error fetching txn history')
    }
  }

  async getTaprootTxHistory({
    taprootAddress,
    totalTxs = 20,
  }: {
    taprootAddress: string
    totalTxs?: number
  }) {
    const addressType = getAddressType(taprootAddress)

    if (addressType === 1) {
      return await this.apiClient.getTaprootTxHistory(taprootAddress, totalTxs)
    } else {
      throw new Error('Invalid address type')
    }
  }

  /**
   * Retrieves a list of inscriptions for a given address.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address to query for inscriptions.
   * @returns {Promise<Array<any>>} A promise that resolves to an array of inscription details.
   */
  async getInscriptions({ address }) {
    const collectibles = []
    const brc20 = []
    const allOrdinals: any[] = (
      await this.apiClient.getAllInscriptionsByAddress(address)
    ).data

    const allCollectibles: any[] = allOrdinals.filter(
      (ordinal: any) =>
        ordinal.mime_type === 'image/png' || ordinal.mime_type.includes('html')
    )

    const allBrc20s: any[] = allOrdinals.filter(
      (ordinal: any) => ordinal.mime_type === 'text/plain;charset=utf-8'
    )

    for (const artifact of allCollectibles) {
      const { inscription_id, inscription_number, satpoint } = artifact
      const content = await this.ordRpc.getInscriptionContent(inscription_id)

      const detail = {
        id: inscription_id,
        address: artifact.owner_wallet_addr,
        content: content,
        location: satpoint,
      }

      collectibles.push({
        id: inscription_id,
        inscription_number,
        detail,
      })
    }

    for (const artifact of allBrc20s) {
      const { inscription_id, inscription_number, satpoint } = artifact
      const content = await this.ordRpc.getInscriptionContent(inscription_id)
      const decodedContent = atob(content)

      if (isValidJSON(decodedContent) && JSON.parse(decodedContent)) {
        const detail = {
          id: inscription_id,
          address: artifact.owner_wallet_addr,
          content: content,
          location: satpoint,
        }

        brc20.push({
          id: inscription_id,
          inscription_number,
          detail,
        })
      }
    }
    return { collectibles, brc20 }
  }

  /**
   * Retrieves UTXO artifacts for a given address.
   * @param {Object} param0 - An object containing the address property.
   * @param {string} param0.address - The address to query for UTXO artifacts.
   * @returns A promise that resolves to the UTXO artifacts.
   */
  async getUtxosArtifacts({ address }) {
    const { unspent_outputs } = await this.getUtxos(address, false)
    const inscriptions = await this.getInscriptions({ address })
    const utxoArtifacts = await transactions.getMetaUtxos(
      address,
      unspent_outputs,
      inscriptions
    )
    return utxoArtifacts as Array<{
      txId: string
      outputIndex: number
      satoshis: number
      scriptPk: string
      confirmations: number
      addressType: number
      address: string
      inscriptions: Array<{
        brc20: {
          id: string
          address: string
          content: string
          location: string
        }
      }>
    }>
  }

  /**
   * Creates a Partially Signed Bitcoin Transaction (PSBT) to send regular satoshis, signs and broadcasts it.
   * @param {Object} params - The parameters for creating the PSBT.
   * @param {string} params.to - The receiving address.
   * @param {string} params.from - The sending address.
   * @param {string} params.amount - The amount to send.
   * @param {number} params.feeRate - The transaction fee rate.
   * @param {any} params.signer - The bound signer method to sign the transaction.
   * @param {string} params.publicKey - The public key associated with the transaction.
   * @returns {Promise<Object>} A promise that resolves to an object containing transaction ID and other response data from the API client.
   */
  async sendBtc({
    senderAddress,
    receiverAddress,
    senderPublicKey,
    feeRate,
    amount,
    payFeesWithSegwit,
    segwitFeePublicKey,
    signer,
  }: {
    senderAddress: string
    receiverAddress: string
    senderPublicKey: string
    feeRate: number
    amount: number
    payFeesWithSegwit?: boolean
    segwitFeePublicKey?: string
    signer: Signer
  }) {
    if (payFeesWithSegwit && !segwitFeePublicKey) {
      throw new Error('Invalid segwit information entered')
    }
    const inputAddressType = addressTypeMap[getAddressType(senderAddress)]
    let segwitUtxos: Utxo[] | undefined
    let taprootUtxos: Utxo[] | undefined

    if (addressTypeToName[inputAddressType] === 'segwit') {
      segwitUtxos = await this.getUtxosArtifacts({
        address: senderAddress,
      })
    }

    if (addressTypeToName[inputAddressType] === 'taproot') {
      taprootUtxos = await this.getUtxosArtifacts({
        address: senderAddress,
      })
    }

    if (!feeRate) {
      feeRate = (await this.esploraRpc.getFeeEstimates())['1']
    }

    let finalPsbt: string

    const { rawPsbt } = await this.createBtcTx({
      senderAddress: senderAddress,
      receiverAddress: receiverAddress,
      amount: amount,
      feeRate: feeRate,
      segwitFeePublicKey: segwitFeePublicKey,
      senderPublicKey: senderPublicKey,
      payFeesWithSegwit: payFeesWithSegwit,
      network: this.network,
      segwitUtxos: segwitUtxos,
      taprootUtxos: taprootUtxos,
    })
    if (payFeesWithSegwit) {
      const { signedPsbt } = await signer.signAllTaprootInputs({
        rawPsbt: rawPsbt,
        finalize: true,
      })

      const { signedPsbt: segwitSigned } = await signer.signAllSegwitInputs({
        rawPsbt: signedPsbt,
        finalize: true,
      })
      finalPsbt = segwitSigned
    }

    if (
      addressTypeToName[inputAddressType] === 'segwit' &&
      !payFeesWithSegwit
    ) {
      const { signedPsbt } = await signer.signAllSegwitInputs({
        rawPsbt: rawPsbt,
        finalize: true,
      })
      finalPsbt = signedPsbt
    }

    if (
      addressTypeToName[inputAddressType] === 'taproot' &&
      !payFeesWithSegwit
    ) {
      const { signedPsbt } = await signer.signAllTaprootInputs({
        rawPsbt: rawPsbt,
        finalize: true,
      })
      finalPsbt = signedPsbt
    }

    const sendResponse = await this.pushPsbt({ psbtBase64: finalPsbt })

    return sendResponse
  }

  async createBtcTx({
    senderAddress,
    receiverAddress,
    senderPublicKey,
    feeRate,
    amount,
    network,
    segwitUtxos,
    taprootUtxos,
    payFeesWithSegwit,
    segwitFeePublicKey,
  }: {
    senderAddress: string
    receiverAddress: string
    senderPublicKey: string
    feeRate: number
    amount: number
    network: bitcoin.Network
    segwitUtxos: Utxo[]
    taprootUtxos: Utxo[]
    payFeesWithSegwit?: boolean
    segwitFeePublicKey?: string
  }) {
    const psbt = new bitcoin.Psbt({ network: network })
    const inputAddressType = addressTypeMap[getAddressType(senderAddress)]
    const useTaprootUtxos = !(
      addressTypeToName[inputAddressType] === 'nested-segwit' ||
      addressTypeToName[inputAddressType] === 'segwit'
    )

    let updatedPsbt: bitcoin.Psbt = await insertBtcUtxo({
      taprootUtxos: taprootUtxos,
      segwitUtxos: segwitUtxos,
      psbt: psbt,
      toAddress: receiverAddress,
      amount: amount,
      useTaprootUtxos: useTaprootUtxos,
      payFeesWithSegwit: payFeesWithSegwit,
      segwitPubKey: segwitFeePublicKey,
      fromAddress: senderAddress,
      feeRate,
      network,
    })

    if (addressTypeToName[inputAddressType] === 'taproot') {
      updatedPsbt = await formatInputsToSign({
        _psbt: updatedPsbt,
        senderPublicKey: senderPublicKey,
        network,
      })
    }

    return {
      rawPsbt: updatedPsbt.toBase64(),
    }
  }

  /**
   * Retrieves information about a SegWit address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The SegWit address to validate and get information for.
   * @returns {Promise<Object>} A promise that resolves to an object containing validity status and summary of the address.
   */
  async getSegwitAddressInfo({ address }) {
    const isValid = transactions.validateSegwitAddress({
      address,
      type: 'segwit',
    })
    if (!isValid) {
      return { isValid, summary: null }
    }
    const summary = await this.getAddressSummary({
      address,
    })
    return { isValid, summary }
  }

  /**
   * Retrieves information about a Taproot address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The Taproot address to validate and get information for.
   * @returns {Promise<Object>} A promise that resolves to an object containing validity status and summary of the address.
   */
  async getTaprootAddressInfo({ address }) {
    const isValid = transactions.validateTaprootAddress({
      address,
      type: 'taproot',
    })
    if (!isValid) {
      return { isValid, summary: null }
    }
    const summary = await this.getAddressSummary({
      address,
      includeInscriptions: false,
    })
    return { isValid, summary }
  }

  /**
   * Fetches offers associated with a specific BRC20 ticker.
   * @param {Object} params - The parameters containing the ticker information.
   * @param {string} params.ticker - The ticker symbol to retrieve offers for.
   * @returns {Promise<any>} A promise that resolves to an array of offers.
   */
  async getBrcOffers({ ticker }) {
    const offers = await this.apiClient.getOkxTickerOffers({ ticker: ticker })
    return offers
  }

  /**
   * Fetches aggregated offers associated with a specific BRC20 ticker.
   * @param {Object} params - The parameters containing the ticker information.
   * @param {string} params.ticker - The ticker symbol to retrieve offers for.
   * @param {}
   * @returns {Promise<any>} A promise that resolves to an array of offers.
   */
  async getAggregatedBrcOffers({
    ticker,
    limitOrderAmount,
    marketPrice,
  }: {
    ticker: string
    limitOrderAmount: number
    marketPrice: number
  }) {
    const testnet = this.network == getNetwork('testnet')
    const offers = await this.apiClient.getAggregatedOffers({
      ticker,
      limitOrderAmount,
      marketPrice,
      testnet,
    })
    return offers
  }

  /**
   * Lists BRC20 tokens associated with an address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The address to list BRC20 tokens for.
   * @returns {Promise<any>} A promise that resolves to an array of BRC20 tokens.
   */
  async listBrc20s({ address }: { address: string }) {
    const tokens = await this.apiClient.getBrc20sByAddress(address)
    for (let i = 0; i < tokens.data.length; i++) {
      const details = await this.apiClient.getBrc20TokenDetails(
        tokens.data[i].ticker
      )
      tokens.data[i]['details'] = details.data
    }
    return tokens
  }

  /**
   * Lists inscribed collectibles associated with an address.
   * @param {Object} params - The parameters containing the address information.
   * @param {string} params.address - The address to list collectibles for.
   * @returns {Promise<any>} A promise that resolves to an array of collectibles.
   */
  async listCollectibles({ address }: { address: string }) {
    return await this.apiClient.getCollectiblesByAddress(address)
  }

  /**
   * Retrieves a specific inscribed collectible by its ID.
   * @param {string} inscriptionId - The ID of the collectible to retrieve.
   * @returns {Promise<any>} A promise that resolves to the collectible data.
   */
  async getCollectibleById(inscriptionId: string) {
    const data = await this.ordRpc.getInscriptionById(inscriptionId)
    return data as {
      address: string
      children: any[]
      content_length: number
      content_type: string
      genesis_fee: number
      genesis_height: number
      inscription_id: string
      inscription_number: number
      next: string
      output_value: number
      parent: any
      previous: string
      rune: any
      sat: number
      satpoint: string
      timestamp: number
    }
  }

  async signPsbt({
    psbtHex,
    publicKey,
    address,
    signer,
  }: {
    psbtHex: string
    publicKey: string
    address: string
    signer: HdKeyring['signTransaction']
  }) {
    const addressType = getAddressType(address)

    const tx = new OGPSBTTransaction(
      signer,
      address,
      publicKey,
      addressType,
      this.network
    )

    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: this.network })

    const signedPsbt = await tx.signPsbt(psbt)

    return {
      psbtHex: signedPsbt.toHex(),
    }
  }

  async pushPsbt({
    psbtHex,
    psbtBase64,
  }: {
    psbtHex?: string
    psbtBase64?: string
  }) {
    if (!psbtHex && !psbtBase64) {
      throw new Error('Please supply psbt in either base64 or hex format')
    }
    if (psbtHex && psbtBase64) {
      throw new Error('Please select one format of psbt to broadcast')
    }
    let psbt: bitcoin.Psbt
    if (psbtHex) {
      psbt = bitcoin.Psbt.fromHex(psbtHex, { network: this.network })
    }

    if (psbtBase64) {
      psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: this.network })
    }
    const txId = psbt.extractTransaction().getId()
    const rawTx = psbt.extractTransaction().toHex()
    const [result] =
      await this.sandshrewBtcClient.bitcoindRpc.testMemPoolAccept([rawTx])

    if (!result.allowed) {
      throw new Error(result['reject-reason'])
    }

    await this.sandshrewBtcClient.bitcoindRpc.sendRawTransaction(rawTx)

    return { txId, rawTx }
  }

  async finalizePsbtBase64(psbtBase64) {
    try {
      const { hex: finalizedPsbtHex } = await this.sandshrewBtcClient._call(
        'btc_finalizepsbt',
        [`${psbtBase64}`]
      )

      return finalizedPsbtHex
    } catch (e) {
      console.log(e)
      throw new Error(e)
    }
  }
  async sendPsbt(txData: string, isDry?: boolean) {
    try {
      if (isDry) {
        const response = await this.sandshrewBtcClient._call(
          'btc_testmempoolaccept',
          [`${txData}`]
        )
        console.log({ response })
      } else {
        const { hex: txHex } = await this.sandshrewBtcClient._call(
          'btc_sendrawtransaction',
          [`${txData}`]
        )

        return {
          sentPsbt: txHex,
          sentPsbtBase64: Buffer.from(txHex, 'hex').toString('base64'),
        }
      }
    } catch (e) {
      console.log(e)
      throw new Error(e)
    }
  }

  async createSegwitSigner({
    mnemonic,
    segwitAddress,
    hdPathWithIndex,
  }: {
    mnemonic: string
    segwitAddress: string
    hdPathWithIndex: string
  }) {
    const segwitAddressType = transactions.getAddressType(segwitAddress)

    if (segwitAddressType == null) {
      throw Error('Unrecognized Address Type')
    }
    const segwitPayload = await this.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: hdPathWithIndex,
      addrType: segwitAddressType,
    })

    const segwitKeyring = segwitPayload.keyring.keyring
    const segwitSigner = segwitKeyring.signTransaction.bind(segwitKeyring)
    return segwitSigner
  }

  async createTaprootSigner({
    mnemonic,
    taprootAddress,
    hdPathWithIndex = customPaths['oyl']['taprootPath'],
  }: {
    mnemonic: string
    taprootAddress: string
    hdPathWithIndex?: string
  }) {
    const addressType = transactions.getAddressType(taprootAddress)
    if (addressType == null) {
      throw Error('Unrecognized Address Type')
    }

    const tapPayload = await this.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: hdPathWithIndex,
      addrType: addressType,
    })

    const tapKeyring = tapPayload.keyring.keyring

    const taprootSigner = tapKeyring.signTransaction.bind(tapKeyring)
    return taprootSigner
  }

  async createSigner({
    mnemonic,
    fromAddress,
    hdPathWithIndex,
  }: {
    mnemonic: string
    fromAddress: string
    hdPathWithIndex: string
  }) {
    const addressType = transactions.getAddressType(fromAddress)
    if (addressType == null) {
      throw Error('Unrecognized Address Type')
    }

    const tapPayload = await this.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: hdPathWithIndex,
      addrType: addressType,
    })

    const tapKeyring = tapPayload.keyring.keyring

    const taprootSigner = tapKeyring.signTransaction.bind(tapKeyring)
    return taprootSigner
  }

  async createInscriptionCommitPsbt({
    content,
    senderAddress,
    senderPublicKey,
    segwitFeePublicKey,
    payFeesWithSegwit,
    feeRate,
    taprootUtxos,
    signer,
  }: {
    content: string
    senderAddress: string
    senderPublicKey: string
    segwitFeePublicKey: string
    feeRate: number
    payFeesWithSegwit?: boolean
    taprootUtxos: Utxo[]
    signer: Signer
  }) {
    const commitTxSize = calculateTaprootTxSize(3, 0, 2)
    const feeForCommit =
      commitTxSize * feeRate < 200 ? 200 : commitTxSize * feeRate

    const revealTxSize = calculateTaprootTxSize(1, 0, 1)
    const feeForReveal =
      revealTxSize * feeRate < 200 ? 200 : revealTxSize * feeRate

    const amountNeededForInscribe =
      Number(feeForCommit) + Number(feeForReveal) + inscriptionSats
    const utxosUsedForFees: string[] = []
    const psbt = new bitcoin.Psbt({ network: this.network })
    const secret = signer.taprootKeyPair.privateKey.toString('hex')

    const pubKey = ecc2.keys.get_pubkey(String(secret), true)

    const script = createInscriptionScript(pubKey, content)
    const tapleaf = Tap.encodeScript(script)
    const [tpubkey] = Tap.getPubKey(pubKey, { target: tapleaf })
    const inscriberAddress = Address.p2tr.fromPubKey(
      tpubkey,
      this.currentNetwork
    )
    psbt.addOutput({
      value: Number(feeForReveal) + inscriptionSats,
      address: inscriberAddress,
    })

    if (payFeesWithSegwit) {
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(segwitFeePublicKey, 'hex'),
        network: this.network,
      })
      const segwitUtxos = await this.getUtxosArtifacts({
        address: p2wpkh.address,
      })

      const utxosToPayFee = findUtxosToCoverAmount(
        segwitUtxos,
        amountNeededForInscribe
      )
      if (!utxosToPayFee) {
        throw new Error('insufficient segwit balance')
      }
      const feeAmountGathered = calculateAmountGatheredUtxo(
        utxosToPayFee.selectedUtxos
      )
      const changeAmount =
        feeAmountGathered - feeForCommit - feeForReveal - inscriptionSats

      for (let i = 0; i < utxosToPayFee.selectedUtxos.length; i++) {
        utxosUsedForFees.push(utxosToPayFee.selectedUtxos[i].txId)
        psbt.addInput({
          hash: utxosToPayFee.selectedUtxos[i].txId,
          index: utxosToPayFee.selectedUtxos[i].outputIndex,
          witnessUtxo: {
            value: utxosToPayFee.selectedUtxos[i].satoshis,
            script: Buffer.from(utxosToPayFee.selectedUtxos[i].scriptPk, 'hex'),
          },
        })
      }
      psbt.addOutput({
        address: p2wpkh.address,
        value: changeAmount,
      })

      const formattedPsbt: bitcoin.Psbt = await formatInputsToSign({
        _psbt: psbt,
        senderPublicKey: senderPublicKey,
        network: this.network,
      })

      return { commitPsbt: formattedPsbt.toBase64() }
    }

    const utxosToSend = findUtxosToCoverAmount(
      taprootUtxos,
      amountNeededForInscribe
    )
    const amountGathered = calculateAmountGatheredUtxo(
      utxosToSend.selectedUtxos
    )
    const changeAmount =
      amountGathered - feeForCommit - feeForReveal - inscriptionSats

    for await (const utxo of utxosToSend.selectedUtxos) {
      utxosUsedForFees.push(utxo.txId)
      psbt.addInput({
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          script: Buffer.from(utxo.scriptPk, 'hex'),
          value: utxo.satoshis,
        },
      })
    }

    if (amountGathered > inscriptionSats) {
      psbt.addOutput({
        value: changeAmount,
        address: senderAddress,
      })
    }

    const formattedPsbt: bitcoin.Psbt = await formatInputsToSign({
      _psbt: psbt,
      senderPublicKey: senderPublicKey,
      network: this.network,
    })

    return {
      commitPsbt: formattedPsbt.toBase64(),
      utxosUsedForFees: utxosUsedForFees,
    }
  }

  async createRevealPsbt({
    senderAddress,
    signer,
    content,
    feeRate,
    commitTxId,
  }: {
    senderAddress: string
    signer: Signer
    content: string
    feeRate: number
    commitTxId: string
  }) {
    const revealTxSize = calculateTaprootTxSize(1, 0, 1)
    const feeForReveal =
      revealTxSize * feeRate < 200 ? 200 : revealTxSize * feeRate

    const revealSats = feeForReveal + inscriptionSats
    const secret = signer.taprootKeyPair.privateKey.toString('hex')

    const secKey = ecc2.keys.get_seckey(String(secret))

    const pubKey = ecc2.keys.get_pubkey(String(secret), true)

    const script = createInscriptionScript(pubKey, content)
    const tapleaf = Tap.encodeScript(script)
    const [tpubkey, cblock] = Tap.getPubKey(pubKey, { target: tapleaf })

    const commitTxOutput = await getOutputValueByVOutIndex({
      txId: commitTxId,
      vOut: 0,
      esploraRpc: this.esploraRpc,
    })

    if (!commitTxOutput) {
      throw new Error('ERROR GETTING FIRST INPUT VALUE')
    }

    const txData = Tx.create({
      vin: [
        {
          txid: commitTxId,
          vout: 0,
          prevout: {
            value: revealSats,
            scriptPubKey: ['OP_1', tpubkey],
          },
        },
      ],
      vout: [
        {
          value: 546,
          scriptPubKey: Address.toScriptPubKey(senderAddress),
        },
      ],
    })

    const sig = cmdcode.Signer.taproot.sign(secKey, txData, 0, {
      extension: tapleaf,
    })

    txData.vin[0].witness = [sig, script, cblock]

    const inscriptionTxHex = Tx.encode(txData).hex

    return {
      revealTx: inscriptionTxHex,
      revealTpubkey: tpubkey,
    }
  }

  async sendBRC20({
    signer,
    senderAddress,
    receiverAddress,
    senderPublicKey,
    payFeesWithSegwit,
    segwitFeePublicKey,
    feeRate,
    token,
    amount,
  }: {
    signer: Signer
    senderAddress: string
    receiverAddress?: string
    senderPublicKey: string
    payFeesWithSegwit: boolean
    segwitFeePublicKey: string
    feeRate?: number
    token?: string
    amount?: number
    postage?: number
  }) {
    try {
      if (!feeRate) {
        feeRate = (await this.esploraRpc.getFeeEstimates())['1']
      }

      if (payFeesWithSegwit && !segwitFeePublicKey) {
        throw new Error('Invalid segwit information entered')
      }
      const inputAddressType = addressTypeMap[getAddressType(senderAddress)]

      const taprootUtxos = await this.getUtxosArtifacts({
        address: senderAddress,
      })

      const content = `{"p":"brc-20","op":"transfer","tick":"${token}","amt":"${amount}"}`

      const { commitPsbt, utxosUsedForFees } =
        await this.createInscriptionCommitPsbt({
          content,
          senderAddress: senderAddress,
          senderPublicKey: senderPublicKey,
          signer,
          segwitFeePublicKey: segwitFeePublicKey,
          payFeesWithSegwit: payFeesWithSegwit,
          taprootUtxos,
          feeRate,
        })

      const { signedPsbt } = await this.useSigner({
        payFeesWithSegwit: payFeesWithSegwit,
        psbt: commitPsbt,
        signer: signer,
        inputAddressType: inputAddressType,
      })

      const { txId: commitTxId } = await this.pushPsbt({
        psbtBase64: signedPsbt,
      })
      const txResult = await waitForTransaction({
        txId: commitTxId,
        sandshrewBtcClient: this.sandshrewBtcClient,
      })
      if (!txResult) {
        throw new Error('ERROR WAITING FOR COMMIT TX')
      }

      const { revealTx } = await this.createRevealPsbt({
        senderAddress,
        signer,
        content,
        commitTxId: commitTxId,
        feeRate,
      })

      const revealTxId =
        await this.sandshrewBtcClient.bitcoindRpc.sendRawTransaction(revealTx)

      const revealResult = await waitForTransaction({
        txId: revealTxId,
        sandshrewBtcClient: this.sandshrewBtcClient,
      })
      if (!revealResult) {
        throw new Error('ERROR WAITING FOR COMMIT TX')
      }
      await delay(5000)

      const { sentPsbt: sentRawPsbt } = await this.sendBtcUtxo({
        senderAddress,
        receiverAddress,
        senderPublicKey,
        payFeesWithSegwit,
        segwitFeePublicKey,
        feeRate,
        taprootUtxos,
        utxoId: revealTxId,
        utxosUsedForFees: utxosUsedForFees,
      })

      const { signedPsbt: sentPsbt } = await this.useSigner({
        payFeesWithSegwit: payFeesWithSegwit,
        psbt: sentRawPsbt,
        signer: signer,
        inputAddressType: inputAddressType,
      })

      const { txId: sentPsbtTxId } = await this.pushPsbt({
        psbtBase64: sentPsbt,
      })
      return {
        txId: sentPsbtTxId,
        rawTxn: sentPsbt,
        sendBrc20Txids: [commitTxId, revealTxId, sentPsbtTxId],
      }
    } catch (err) {
      console.error(err)
      throw new Error(err)
    }
  }

  async sendBtcUtxo({
    senderAddress,
    receiverAddress,
    senderPublicKey,
    payFeesWithSegwit,
    segwitFeePublicKey,
    feeRate,
    taprootUtxos,
    utxoId,
    utxosUsedForFees,
  }: {
    senderAddress: string
    receiverAddress: string
    senderPublicKey: string
    payFeesWithSegwit: boolean
    segwitFeePublicKey: string
    feeRate?: number
    taprootUtxos: Utxo[]
    utxoId: string
    utxosUsedForFees: string[]
  }) {
    if (!feeRate) {
      feeRate = (await this.esploraRpc.getFeeEstimates())['1']
    }

    const txSize = calculateTaprootTxSize(2, 0, 2)
    const fee = txSize * feeRate < 300 ? 300 : txSize * feeRate

    const utxoInfo = await this.esploraRpc.getTxInfo(utxoId)

    const rawPsbt = new bitcoin.Psbt({ network: this.network })
    rawPsbt.addInput({
      hash: utxoId,
      index: 0,
      witnessUtxo: {
        script: Buffer.from(utxoInfo.vout[0].scriptpubkey, 'hex'),
        value: 546,
      },
    })

    rawPsbt.addOutput({
      address: receiverAddress,
      value: 546,
    })

    if (payFeesWithSegwit) {
      const txSize = calculateTaprootTxSize(2, 2, 2)
      const fee = txSize * feeRate < 300 ? 300 : txSize * feeRate
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(segwitFeePublicKey, 'hex'),
        network: this.network,
      })
      const segwitUtxos = await this.getUtxosArtifacts({
        address: p2wpkh.address,
      })

      let availableUtxos = segwitUtxos.filter(
        (utxo) => !utxosUsedForFees.includes(utxo.txId)
      )

      const utxosToPayFee = findUtxosToCoverAmount(availableUtxos, fee)
      if (!utxosToPayFee) {
        throw new Error('insufficient segwit balance')
      }
      const feeAmountGathered = calculateAmountGatheredUtxo(
        utxosToPayFee.selectedUtxos
      )
      const changeAmount = feeAmountGathered - fee

      for (let i = 0; i < utxosToPayFee.selectedUtxos.length; i++) {
        rawPsbt.addInput({
          hash: utxosToPayFee.selectedUtxos[i].txId,
          index: utxosToPayFee.selectedUtxos[i].outputIndex,
          witnessUtxo: {
            value: utxosToPayFee.selectedUtxos[i].satoshis,
            script: Buffer.from(utxosToPayFee.selectedUtxos[i].scriptPk, 'hex'),
          },
        })
      }

      rawPsbt.addOutput({
        address: p2wpkh.address,
        value: changeAmount,
      })

      return {
        sentPsbt: rawPsbt.toBase64(),
      }
    }

    let filteredUtxos: any[] = await filterTaprootUtxos({ taprootUtxos })
    let availableUtxos = filteredUtxos.filter(
      (utxo) => !utxosUsedForFees.includes(utxo.txId)
    )
    const utxosToSend = findUtxosToCoverAmount(availableUtxos, fee)

    if (!utxosToSend) {
      throw new Error('No available utxos to send')
    }

    const amountGathered = calculateAmountGatheredUtxo(
      utxosToSend.selectedUtxos
    )
    const changeAmount = amountGathered - fee

    for await (const utxo of utxosToSend.selectedUtxos) {
      rawPsbt.addInput({
        hash: utxo.txId,
        index: utxo.outputIndex,
        witnessUtxo: {
          script: Buffer.from(utxo.scriptPk, 'hex'),
          value: utxo.satoshis,
        },
      })
    }

    if (amountGathered > inscriptionSats) {
      rawPsbt.addOutput({
        value: changeAmount,
        address: senderAddress,
      })
    }

    const formattedPsbt: bitcoin.Psbt = await formatInputsToSign({
      _psbt: rawPsbt,
      senderPublicKey: senderPublicKey,
      network: this.network,
    })

    return { sentPsbt: formattedPsbt.toBase64() }
  }

  async sendOrdCollectible({
    senderAddress,
    receiverAddress,
    senderPublicKey,
    payFeesWithSegwit,
    segwitFeePublicKey,
    signer,
    feeRate,
    inscriptionId,
  }: {
    senderAddress: string
    receiverAddress: string
    senderPublicKey: string
    payFeesWithSegwit: boolean
    segwitFeePublicKey: string
    signer: Signer
    feeRate?: number
    inscriptionId: string
  }) {
    try {
      const inputAddressType = addressTypeMap[getAddressType(senderAddress)]
      if (payFeesWithSegwit && !segwitFeePublicKey) {
        throw new Error('Invalid segwit information entered')
      }

      const { rawPsbt } = await this.createOrdCollectibleTx({
        inscriptionId,
        senderAddress,
        senderPublicKey,
        inputAddressType,
        receiverAddress,
        payFeesWithSegwit,
        segwitFeePublicKey,
        feeRate,
      })

      let finalPsbt: string

      if (!feeRate) {
        feeRate = (await this.esploraRpc.getFeeEstimates())['1']
      }

      if (payFeesWithSegwit) {
        const { signedPsbt } = await signer.signAllTaprootInputs({
          rawPsbt: rawPsbt,
          finalize: true,
        })

        const { signedPsbt: segwitSigned } = await signer.signAllSegwitInputs({
          rawPsbt: signedPsbt,
          finalize: true,
        })
        finalPsbt = segwitSigned
      }
      if (
        addressTypeToName[inputAddressType] === 'segwit' &&
        !payFeesWithSegwit
      ) {
        const { signedPsbt } = await signer.signAllSegwitInputs({
          rawPsbt: rawPsbt,
          finalize: true,
        })
        finalPsbt = signedPsbt
      }

      if (
        addressTypeToName[inputAddressType] === 'taproot' &&
        !payFeesWithSegwit
      ) {
        const { signedPsbt } = await signer.signAllTaprootInputs({
          rawPsbt: rawPsbt,
          finalize: true,
        })
        finalPsbt = signedPsbt
      }

      return await this.pushPsbt({ psbtBase64: finalPsbt })
    } catch (error) {
      console.error(error)
      throw new Error(error)
    }
  }

  async createOrdCollectibleTx({
    inscriptionId,
    senderAddress,
    senderPublicKey,
    inputAddressType,
    receiverAddress,
    payFeesWithSegwit,
    segwitFeePublicKey,
    feeRate,
  }: {
    inscriptionId: string
    senderAddress: string
    receiverAddress: string
    feeRate: number
    inputAddressType: string
    senderPublicKey: string
    payFeesWithSegwit?: boolean
    segwitFeePublicKey?: string
  }) {
    const sendTxSize = calculateTaprootTxSize(3, 0, 2)
    const feeForSend = sendTxSize * feeRate < 200 ? 200 : sendTxSize * feeRate

    const senderUtxos = await this.getUtxosArtifacts({
      address: senderAddress,
    })

    const collectibleData = await this.getCollectibleById(inscriptionId)

    if (collectibleData.address !== senderAddress) {
      throw new Error('Inscription does not belong to fromAddress')
    }

    const inscriptionTxId = collectibleData.satpoint.split(':')[0]
    const inscriptionTxVOutIndex = collectibleData.satpoint.split(':')[1]
    const inscriptionUtxoDetails = await this.esploraRpc.getTxInfo(
      inscriptionTxId
    )
    const inscriptionUtxoData =
      inscriptionUtxoDetails.vout[inscriptionTxVOutIndex]

    const isSpentArray = await this.esploraRpc.getTxOutspends(inscriptionTxId)
    const isSpent = isSpentArray[inscriptionTxVOutIndex]

    if (isSpent.spent) {
      throw new Error('Inscription is missing')
    }

    let psbtTx = new bitcoin.Psbt({ network: this.network })
    const { unspent_outputs } = await this.getUtxos(senderAddress, true)
    const inscriptionTx = unspent_outputs.find(
      (utxo) => inscriptionTxId === utxo.tx_hash_big_endian
    )

    psbtTx.addInput({
      hash: inscriptionTxId,
      index: parseInt(inscriptionTxVOutIndex),
      witnessUtxo: {
        script: Buffer.from(inscriptionTx.script, 'hex'),
        value: inscriptionUtxoData.value,
      },
    })

    psbtTx.addOutput({
      address: receiverAddress,
      value: inscriptionUtxoData.value,
    })

    if (!payFeesWithSegwit) {
      const utxosForTransferSendFees = await filterTaprootUtxos({
        taprootUtxos: senderUtxos,
      })
      const utxosToSend = findUtxosToCoverAmount(
        utxosForTransferSendFees,
        feeForSend
      )
      const amountGathered = calculateAmountGatheredUtxo(
        utxosToSend.selectedUtxos
      )

      for await (const utxo of utxosToSend.selectedUtxos) {
        psbtTx.addInput({
          hash: utxo.txId,
          index: utxo.outputIndex,
          witnessUtxo: {
            script: Buffer.from(utxo.scriptPk, 'hex'),
            value: utxo.satoshis,
          },
        })
      }
      const reimbursementAmount = amountGathered - feeForSend
      if (reimbursementAmount > 546) {
        psbtTx.addOutput({
          address: senderAddress,
          value: amountGathered - feeForSend,
        })
      }
    }

    if (payFeesWithSegwit) {
      const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(segwitFeePublicKey, 'hex'),
        network: this.network,
      })
      const segwitUtxos = await this.getUtxosArtifacts({
        address: p2wpkh.address,
      })
      const feeTxSize = calculateTaprootTxSize(2, 1, 3)
      const feeAmount = feeTxSize * feeRate < 250 ? 250 : feeTxSize * feeRate
      const utxosToPayFee = findUtxosToCoverAmount(segwitUtxos, feeAmount)
      if (!utxosToPayFee) {
        throw new Error('insufficient segwit balance')
      }
      const feeAmountGathered = calculateAmountGatheredUtxo(
        utxosToPayFee.selectedUtxos
      )
      const changeAmount = feeAmountGathered - feeAmount

      for (let i = 0; i < utxosToPayFee.selectedUtxos.length; i++) {
        psbtTx.addInput({
          hash: utxosToPayFee.selectedUtxos[i].txId,
          index: utxosToPayFee.selectedUtxos[i].outputIndex,
          witnessUtxo: {
            value: utxosToPayFee.selectedUtxos[i].satoshis,
            script: Buffer.from(utxosToPayFee.selectedUtxos[i].scriptPk, 'hex'),
          },
        })
      }
      psbtTx.addOutput({
        address: p2wpkh.address,
        value: changeAmount,
      })
    }

    if (addressTypeToName[inputAddressType] === 'taproot') {
      psbtTx = await formatInputsToSign({
        _psbt: psbtTx,
        senderPublicKey: senderPublicKey,
        network: this.network,
      })
    }

    return { rawPsbt: psbtTx.toBase64() }
  }

  async useSigner({
    payFeesWithSegwit,
    psbt,
    signer,
    inputAddressType,
  }: {
    payFeesWithSegwit: boolean
    psbt: string
    signer: Signer
    inputAddressType: string
  }) {
    let finalPsbt: string
    if (payFeesWithSegwit) {
      const { signedPsbt } = await signer.signAllTaprootInputs({
        rawPsbt: psbt,
        finalize: true,
      })

      const { signedPsbt: segwitSigned } = await signer.signAllSegwitInputs({
        rawPsbt: signedPsbt,
        finalize: true,
      })
      finalPsbt = segwitSigned
    }
    if (
      addressTypeToName[inputAddressType] === 'segwit' &&
      !payFeesWithSegwit
    ) {
      const { signedPsbt } = await signer.signAllSegwitInputs({
        rawPsbt: psbt,
        finalize: true,
      })
      finalPsbt = signedPsbt
    }

    if (
      addressTypeToName[inputAddressType] === 'taproot' &&
      !payFeesWithSegwit
    ) {
      const { signedPsbt } = await signer.signAllTaprootInputs({
        rawPsbt: psbt,
        finalize: true,
      })
      finalPsbt = signedPsbt
    }

    return { signedPsbt: finalPsbt }
  }
}
