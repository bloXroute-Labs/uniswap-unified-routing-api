import { BigNumber } from 'ethers';

import { DutchQuote, DutchQuoteDataJSON, QuoteRequest } from '..';
import { RoutingType } from '../../constants';
import { ClassicQuote, ClassicQuoteDataJSON } from './ClassicQuote';

export * from './ClassicQuote';
export * from './DutchQuote';

export type QuoteJSON = DutchQuoteDataJSON | ClassicQuoteDataJSON;

export type LogJSON = {
  quoteId: string;
  requestId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  endAmountIn: string;
  endAmountOut: string;
  amountInGasAdjusted?: string;
  amountInGasAndPortionAdjusted?: string;
  amountOutGasAdjusted?: string;
  amountOutGasAndPortionAdjusted?: string;
  tokenInChainId: number;
  tokenOutChainId: number;
  swapper: string;
  routing: string;
  createdAt: string;
  createdAtMs: string;
  slippage: number;
  filler?: string;
  gasPriceWei?: string;
  portionBips?: number;
  portionRecipient?: string;
  portionAmount?: string;
  portionAmountDecimals?: string;
  quoteGasAndPortionAdjusted?: string;
  quoteGasAndPortionAdjustedDecimals?: string;
  portionAmountOutStart?: string;
  portionAmountOutEnd?: string;
};

export interface IQuote {
  routingType: RoutingType;
  amountOut: BigNumber;
  amountIn: BigNumber;
  toJSON(): QuoteJSON;
  request: QuoteRequest;
  toLog(): LogJSON;
}

export type Quote = DutchQuote | ClassicQuote;
