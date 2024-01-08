import { Unit } from 'aws-embedded-metrics';
import * as http from 'http';
import * as https from 'https';
import NodeCache from 'node-cache';
import { DEFAULT_NEGATIVE_CACHE_ENTRY_TTL, DEFAULT_POSITIVE_CACHE_ENTRY_TTL, uraEnablePortion } from '../constants';
import axios from '../providers/quoters/helpers';
import { log } from '../util/log';
import { metrics } from '../util/metrics';
import { forcePortion } from '../util/portion';

export enum PortionType {
  Flat = 'flat',
  Regressive = 'regressive',
}

export interface Portion {
  readonly bips: number;
  readonly recipient: string;
  readonly type: PortionType;
}

export interface GetPortionResponse {
  readonly hasPortion: boolean;
  readonly portion?: Portion;
}

export const GET_NO_PORTION_RESPONSE: GetPortionResponse = { hasPortion: false, portion: undefined };

export const BX_PORTION_ADDRESSES = [
  "eth", // ETH
  "0x0000000000000000000000000000000000000000", // ETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  "0x1a7e4e63778b4f12a199c062f3efdd288afcbce8", // agEUR
  "0x056fd409e1d7a124bd7017459dfea2f387b6d5cd", // GUSD
  "0x5f98805a4e8be255a32880fdec7f6728c6568ba0", // LUSD
  "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c", // EUROC
  "0x70e8de73ce538da2beed35d14187f6959a8eca96", // XSGD
]

export const BX_PORTION_RESPONSE: GetPortionResponse = { 
  hasPortion: true, 
  portion: {
    bips: 5,
    recipient: '0x27213E28D7fDA5c57Fe9e5dD923818DBCcf71c47',
    type: PortionType.Flat,
  }
};

export class PortionFetcher {
  private PORTION_CACHE_KEY = (
    tokenInChainId: number,
    tokenInAddress: string,
    tokenOutChainId: number,
    tokenOutAddress: string
  ) =>
    `PortionFetcher-${tokenInChainId}-${tokenInAddress.toLowerCase()}-${tokenOutChainId}-${tokenOutAddress.toLowerCase()}`;

  private getPortionFullPath = `${this.portionApiUrl}/portion`;
  private portionServiceInstance = axios.create({
    baseURL: this.portionApiUrl,
    // keep connections alive,
    // maxSockets default is Infinity, so Infinity is read as 50 sockets
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
  });

  constructor(
    private portionApiUrl: string,
    private portionCache: NodeCache,
    private positiveCacheEntryTtl = DEFAULT_POSITIVE_CACHE_ENTRY_TTL,
    private negativeCacheEntryTtl = DEFAULT_NEGATIVE_CACHE_ENTRY_TTL
  ) {}

  async getPortion(
    tokenInChainId: number,
    tokenInAddress: string,
    tokenOutChainId: number,
    tokenOutAddress: string
  ): Promise<GetPortionResponse> {
    metrics.putMetric(`PortionFetcherRequest`, 1);

    if(uraEnablePortion()) {
      if(BX_PORTION_ADDRESSES.includes(tokenInAddress.toLowerCase()) && 
          BX_PORTION_ADDRESSES.includes(tokenOutAddress.toLowerCase())) {
        return BX_PORTION_RESPONSE;
      } 

      return GET_NO_PORTION_RESPONSE;
    }
    
    // we check ENABLE_PORTION for every request, so that the update to the lambda env var gets reflected
    // in real time
    if (!uraEnablePortion()) {
      metrics.putMetric(`PortionFetcherFlagDisabled`, 1);
      return GET_NO_PORTION_RESPONSE;
    }

    // We bypass the cache if `forcePortion` is true.
    // We do it to avoid cache conflicts since `forcePortion` is only for testing purposes.
    const portionFromCache = !forcePortion && this.portionCache.get<GetPortionResponse>(
      this.PORTION_CACHE_KEY(tokenInChainId, tokenInAddress, tokenOutChainId, tokenOutAddress)
    );

    if (portionFromCache) {
      metrics.putMetric(`PortionFetcherCacheHit`, 1);
      return portionFromCache;
    }

    try {
      const beforeGetPortion = Date.now();
      const portionResponse = await this.portionServiceInstance.get<GetPortionResponse>(this.getPortionFullPath, {
        params: {
          tokenInChainId: tokenInChainId,
          tokenInAddress: tokenInAddress,
          tokenOutChainId: tokenOutChainId,
          tokenOutAddress: tokenOutAddress,
        },
      });

      // TODO: ROUTE-96 - add dashboard for URA <-> portion integration monitoring
      metrics.putMetric(`Latency-GetPortion`, Date.now() - beforeGetPortion, Unit.Milliseconds);
      metrics.putMetric(`PortionFetcherSuccess`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      // We bypass the cache if `forcePortion` is true.
      // We do it to avoid cache conflicts since `forcePortion` is only for testing purposes.
      if (!forcePortion) {
        this.portionCache.set<GetPortionResponse>(
          this.PORTION_CACHE_KEY(tokenInChainId, tokenInAddress, tokenOutChainId, tokenOutAddress),
          portionResponse.data,
          portionResponse.data.portion ? this.positiveCacheEntryTtl : this.negativeCacheEntryTtl
        );
      }

      return portionResponse.data;
    } catch (e) {
      // TODO: ROUTE-96 - add alerting for URA <-> portion integration monitoring
      log.error({ e }, 'PortionFetcherErr');
      metrics.putMetric(`PortionFetcherErr`, 1);
      metrics.putMetric(`PortionFetcherCacheMiss`, 1);

      return GET_NO_PORTION_RESPONSE;
    }
  }
}
