import fetch from 'node-fetch'
import { SwapBrcBid, SignedBid } from '../shared/interface'
import { getAllInscriptionsByAddressRegtest } from '../tests/regtestApi'
import { Signer } from '../signer'

/**
 * Represents the client for interacting with the Oyl API.
 */
export class OylApiClient {
  private host: string
  private testnet: boolean
  private regtest: boolean
  private apiKey: string

  /**
   * Create an instance of the OylApiClient.
   * @param options - Configuration object containing the API host.
   */
  constructor(options?: {
    host: string
    apiKey: string
    testnet?: boolean
    regtest?: boolean
  }) {
    this.host = options?.host || ''
    this.testnet = options.testnet == true
    this.regtest = options.regtest == true
    this.apiKey = options.apiKey
  }

  /**
   * Create an instance of the OylApiClient from a plain object.
   * @param data - The data object.
   * @returns An instance of OylApiClient.
   */
  static fromObject(data: {
    host: string
    testnet?: boolean
    apiKey: string
  }): OylApiClient {
    return new this(data)
  }

  /**
   * Convert this OylApiClient instance to a plain object.
   * @returns The plain object representation.
   */
  toObject(): { host: string; testnet: boolean; apiKey: string } {
    return {
      host: this.host,
      testnet: this.testnet,
      apiKey: this.apiKey,
    }
  }

  private async _call(path: string, method: string, data?: any) {
    try {
      const options: RequestInit = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.apiKey,
        },
        cache: 'no-cache',
      }
      if (this.testnet) {
        data['testnet'] = this.testnet
      }

      if (['post', 'put', 'patch'].includes(method)) {
        options.body = JSON.stringify(data)
      }

      const response = await fetch(`${this.host}${path}`, options)
      return await response.json()
    } catch (err) {
      throw err
    }
  }

  /**
   * Get brc20 info by ticker.
   * @param ticker - The ticker to query.
   */
  async getBrc20TokenInfo(ticker: string) {
    return await this._call('/get-brc20-token-info', 'post', {
      ticker: ticker,
    })
  }

  /**
   * Get brc20 details by ticker.
   * @param ticker - The ticker to query.
   */
  async getBrc20TokenDetails(ticker: string) {
    return await this._call('/get-brc20-token-details', 'post', {
      ticker: ticker,
    })
  }
  /**
   * Get Brc20 balances by address.
   * @param address - The address to query.
   */

  async getBrc20sByAddress(address: string) {
    return await this._call('/get-address-brc20-balance', 'post', {
      address: address,
    })
  }

  async getBrcPrice(ticker: string) {
    return await this._call('/get-brc-price', 'post', {
      ticker: ticker,
    })
  }

  async getBrc20Tickers(tickerParams: {
    sort_by?: string
    order?: string
    offset?: number
    count?: number
    minting_status?: string
  }) {
    return await this._call('/get-brc20-tickers', 'post', tickerParams)
  }

  async getAllInscriptionsByAddress(address: string): Promise<any> {
    if (this.regtest) {
      return await getAllInscriptionsByAddressRegtest(address)
    } else {
      return await this._call('/get-inscriptions', 'post', {
        address: address,
        exclude_brc20: false,
        count: 20,
        order: 'desc',
      })
    }
  }

  async getInscriptionsForTxn(txn_id: string): Promise<any> {
    const res = await this._call('/get-inscriptions-for-txn', 'post', {
      tx_id: txn_id,
      testnet: this.testnet,
    })

    return res.data
  }

  async getTaprootTxHistory(taprootAddress, totalTxs): Promise<any> {
    const res = await this._call('/get-taproot-history', 'post', {
      taprootAddress: taprootAddress,
      totalTxs: totalTxs,
    })

    return res.data
  }

  async getTaprootBalance(address: string): Promise<any> {
    const res = await this._call('/get-taproot-balance', 'post', {
      address: address,
      testnet: this.testnet,
    })
    if (res.data) {
      return res.data
    } else {
      return res
    }
  }

  async getAddressBalance(address: string): Promise<any> {
    const res = await this._call('/get-address-balance', 'post', {
      address: address,
      testnet: this.testnet,
    })
    if (res.data) {
      return res.data
    } else {
      return res
    }
  }

  /**
   * Get collectible by ID.
   * @param id - The ID of the collectible.
   */
  async getCollectiblesById(id: string): Promise<any> {
    return await this._call('/get-inscription-info', 'post', {
      inscription_id: id,
    })
  }

  /**
   * Get collectibles by address.
   * @param address - The address to query.
   */
  async getCollectiblesByAddress(address: string): Promise<any> {
    return await this._call('/get-inscriptions', 'post', {
      address: address,
      exclude_brc20: true,
    })
  }

  /**
   * Get Unisat ticker offers.
   * @param _ticker - The ticker to query.
   */
  async getUnisatTickerOffers({ ticker }: { ticker: string }): Promise<any> {
    const response = await this._call('/get-token-unisat-offers', 'post', {
      ticker: ticker,
    })
    if (response.error) throw Error(response.error)
    return response.data.list
  }

  /**
   * Get Aggregated brc20 ticker offers for a limit order.
   * @param ticker - The ticker to query.
   * @param limitOrderAmount - The limit order amount.
   * @param marketPrice - The limit order market price.
   * @param testnet - mainnet/testnet network toggle.
   */
  async getAggregatedOffers({
    ticker,
    limitOrderAmount,
    marketPrice,
    testnet,
  }: {
    ticker: string
    limitOrderAmount: number
    marketPrice?: number
    testnet?: boolean
  }): Promise<any> {
    const response = await this._call('/get-brc20-aggregate-offers', 'post', {
      ticker: ticker,
      limitOrderAmount,
      testnet,
    })
    if (response.error) throw Error(response.error)
    return response
  }

  /**
   * Get Okx ticker offers.
   * @param _ticker - The ticker to query.
   */
  async getOkxTickerOffers({ ticker }: { ticker: string }): Promise<any> {
    const response = await this._call('/get-token-okx-offers', 'post', {
      ticker: ticker,
    })
    if (response.error) throw Error(response.error)
    return response.data.items
  }

  /**
   * Get Okx offer psbt.
   * @param offerId - The offer Id to query.
   */
  async getOkxOfferPsbt({ offerId }: { offerId: number }): Promise<any> {
    const response = await this._call('/get-token-okx-offers', 'post', {
      offerId: offerId,
    })
    return response
  }

  /**
   * Get BTC price.
   */
  async getBtcPrice() {
    const response = await this._call('/get-bitcoin-price', 'post', {
      ticker: null,
    })
    return response
  }

  /**
   * Get BTC market chart.
   * @param days - The number of days to use as interval.
   */
  async getBitcoinMarketChart(days: string): Promise<any> {
    const response = await this._call('/get-bitcoin-market-chart', 'post', {
      days: days,
    })
    return response
  }

  /**
   * Get BTC market weekly.
   */
  async getBitcoinMarketWeekly() {
    const response = await this._call('/get-bitcoin-market-weekly', 'post', {
      ticker: null,
    })
    return response
  }

  /**
   * Get BTC markets.
   */
  async getBitcoinMarkets() {
    const response = await this._call('/get-bitcoin-markets', 'post', {
      ticker: null,
    })
    return response
  }

  /**
   * Get Omnisat ticker offers.
   * @param _ticker - The ticker to query.
   */
  async getOmnisatTickerOffers({ ticker }: { ticker: string }): Promise<
    Array<{
      _id: string
      ownerAddress: string
      amount: string
      price: number
      psbtBase64: string
      psbtHex: string
      ticker: string
      transferableInscription: {
        inscription_id: string
        ticker: string
        transfer_amount: string
        is_valid: boolean
        is_used: boolean
        satpoint: string
        min_price: any
        min_unit_price: any
        ordinalswallet_price: any
        ordinalswallet_unit_price: any
        unisat_price: any
        unisat_unit_price: any
      }
      createdAt: number
      updatedAt: string
    }>
  > {
    const response = await this._call('/get-token-omnisat-offers', 'post', {
      ticker: ticker,
    })
    if (response.error) throw Error(response.error)
    return response.data as Array<{
      _id: string
      ownerAddress: string
      amount: string
      price: number
      psbtBase64: string
      psbtHex: string
      ticker: string
      transferableInscription: {
        inscription_id: string
        ticker: string
        transfer_amount: string
        is_valid: boolean
        is_used: boolean
        satpoint: string
        min_price: any
        min_unit_price: any
        ordinalswallet_price: any
        ordinalswallet_unit_price: any
        unisat_price: any
        unisat_unit_price: any
      }
      createdAt: number
      updatedAt: string
    }>
  }

  /**
   * Get Omnisat offer psbt.
   * @param offerId - The offer Id to query.
   */
  async getOmnisatOfferPsbt({
    offerId,
    ticker,
    testnet,
  }: {
    offerId: string
    ticker: string
    testnet?: boolean
  }): Promise<any> {
    const response = await this._call('/get-omnisat-offer-psbt', 'post', {
      offerId: offerId,
      ticker: ticker,
      testnet,
    })
    return response
  }

  /**
   * Initialize a swap bid.
   * @param params - Parameters for the bid.
   */
  async initSwapBid(params: SwapBrcBid): Promise<any> {
    return await this._call('/initiate-unisat-bid', 'post', params)
  }

  /**
   * Submit a signed bid.
   * @param params - Parameters for the signed bid.
   */
  async submitSignedBid(params: SignedBid): Promise<any> {
    return await this._call('/finalize-unisat-bid', 'post', params)
  }

  async sendBtcEstimate({
    feeRate,
    amount,
    altSpendPubKey,
    spendAddress,
    spendPubKey,
    altSpendAddress,
  }: {
    feeRate?: number
    amount: number
    altSpendPubKey?: string
    spendAddress: string
    spendPubKey: string
    altSpendAddress?: string
  }): Promise<any> {
    return await this._call('/send-btc-estimate', 'post', {
      feeRate,
      amount,
      altSpendPubKey,
      spendAddress,
      spendPubKey,
      altSpendAddress,
    })
  }

  async sendBrc20Estimate({
    feeRate,
    altSpendPubKey,
    spendAddress,
    spendPubKey,
    altSpendAddress,
    signer
  }: {
    feeRate?: number
    altSpendPubKey?: string
    spendAddress: string
    spendPubKey: string
    altSpendAddress?: string
    signer: Signer
  }): Promise<any> {
    return await this._call('/send-brc20-estimate', 'post', {
      spendPubKey,
      feeRate,
      altSpendPubKey,
      spendAddress,
      altSpendAddress,
      signer,
      token: 'estimate',
      amount: 1,
    })
  }

  async sendCollectibleEstimate({
    spendAddress,
    altSpendAddress,
    feeRate,
  }: {
    feeRate?: number
    spendAddress: string
    altSpendAddress?: string
  }): Promise<any> {
    return await this._call('/send-collectible-estimate', 'post', {
      spendAddress,
      altSpendAddress,
      feeRate,
    })
  }
}
