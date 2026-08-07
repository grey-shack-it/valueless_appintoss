/// <reference types="node" />

import type { VercelRequest, VercelResponse } from '@vercel/node';

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

const ALLOWED_ORIGINS = [
  'https://*.tossapp.com',
  'https://*.toss.im',
  'https://*.vercel.app',
];

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With',
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

type MarketTab = 'KOSPI' | 'KOSDAQ';

interface TradingData {
  indexCode: string;
  accumulatedAmount: number;
  yesterdaySameTimeAmount: number;
}

interface DebugInfo {
  requestParams?: Record<string, string>;
  rtCd?: string;
  msgCd?: string;
  msg1?: string;
  outputKeys?: string[];
  outputSample?: unknown;
  output2Length?: number;
  output2Sample?: unknown;
  selectedRawAmount?: string;
  error?: string;
}

const INDEX_CODES: Record<MarketTab, string> = {
  KOSPI: '0001',
  KOSDAQ: '1001',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function getKstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function formatKstDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');

  return `${y}${m}${d}`;
}

function formatKstTime(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, '0');
  const m = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');

  return `${h}${m}${s}`;
}

function getPreviousKstBusinessDateString(): string {
  const date = getKstNow();
  date.setUTCDate(date.getUTCDate() - 1);

  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return formatKstDate(date);
}

function parseKisAmountIn100Million(value: string | undefined): number | null {
  const rawAmount = Number(value);
  const amountIn100Million = rawAmount / 100;

  return Number.isFinite(amountIn100Million) && amountIn100Million > 0
    ? amountIn100Million
    : null;
}

function pickLargestValidAmountRow<T extends { acml_tr_pbmn?: string }>(
  rows: T[] | undefined,
): { row: T; amount: number } | null {
  if (!rows?.length) return null;

  let selected: { row: T; amount: number } | null = null;

  for (const row of rows) {
    const amount = parseKisAmountIn100Million(row.acml_tr_pbmn);
    if (amount === null) continue;

    if (!selected || amount > selected.amount) {
      selected = { row, amount };
    }
  }

  return selected;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const appkey = process.env.KIS_APPKEY;
  const appsecret = process.env.KIS_APPSECRET;

  if (!appkey || !appsecret) {
    throw new Error('KIS environment variables are missing');
  }

  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey,
      appsecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`KIS token request failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data.access_token || !data.expires_in) {
    throw new Error('KIS token response is invalid');
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

function kisHeaders(token: string, trId: string) {
  return {
    authorization: `Bearer ${token}`,
    appkey: process.env.KIS_APPKEY ?? '',
    appsecret: process.env.KIS_APPSECRET ?? '',
    tr_id: trId,
    custtype: 'P',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

async function fetchIndexPrice(
  tab: MarketTab,
): Promise<{ amount: number | null; debug: DebugInfo }> {
  const debug: DebugInfo = {};
  const token = await getAccessToken();
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'U',
    FID_INPUT_ISCD: INDEX_CODES[tab],
  });
  debug.requestParams = Object.fromEntries(params.entries());

  const res = await fetch(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price?${params.toString()}`,
    { headers: kisHeaders(token, 'FHPUP02100000'), cache: 'no-store' },
  );

  if (!res.ok) {
    debug.error = `HTTP ${res.status}`;
    return { amount: null, debug };
  }

  const data = (await res.json()) as {
    rt_cd?: string; msg_cd?: string; msg1?: string;
    output?: { acml_tr_pbmn?: string; bstp_nmix_prpr?: string };
  };

  debug.rtCd = data.rt_cd;
  debug.msgCd = data.msg_cd;
  debug.msg1 = data.msg1;
  debug.outputKeys = data.output ? Object.keys(data.output) : [];
  debug.outputSample = data.output;
  debug.selectedRawAmount = data.output?.acml_tr_pbmn;

  if (data.rt_cd !== '0') {
    return { amount: null, debug };
  }

  const amount = parseKisAmountIn100Million(data.output?.acml_tr_pbmn);
  return { amount, debug };
}

async function fetchYesterdaySameTimeAmount(
  tab: MarketTab,
): Promise<{ amount: number | null; debug: DebugInfo }> {
  const debug: DebugInfo = {};

  try {
    const token = await getAccessToken();
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_ETC_CLS_CODE: '0',
      FID_INPUT_ISCD: INDEX_CODES[tab],
      FID_INPUT_HOUR_1: '30',
      FID_PW_DATA_INCU_YN: 'Y',
    });

    debug.requestParams = Object.fromEntries(params.entries());

    const res = await fetch(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice?${params.toString()}`,
      {
        headers: kisHeaders(token, 'FHKUP03500200'),
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      debug.error = `HTTP ${res.status}`;
      return { amount: null, debug };
    }

    const data = (await res.json()) as {
      rt_cd?: string;
      msg_cd?: string;
      msg1?: string;
      output2?: Array<{ acml_tr_pbmn?: string; stck_bsop_date?: string; stck_cntg_hour?: string }>;
    };

    debug.rtCd = data.rt_cd;
    debug.msgCd = data.msg_cd;
    debug.msg1 = data.msg1;
    debug.output2Length = data.output2?.length ?? 0;
    debug.output2Sample = data.output2;

    if (data.rt_cd !== '0' || !data.output2?.length) {
      return { amount: null, debug };
    }

    const selected = pickLargestValidAmountRow(data.output2);
    debug.selectedRawAmount = selected?.row.acml_tr_pbmn;

    return { amount: selected?.amount ?? null, debug };
  } catch (error) {
    debug.error = error instanceof Error ? error.message : 'unknown error';
    return { amount: null, debug };
  }
}

async function fetchYesterdayClosingAmount(
  tab: MarketTab,
): Promise<{ amount: number | null; debug: DebugInfo }> {
  const debug: DebugInfo = {};

  try {
    const token = await getAccessToken();
    const yesterday = getPreviousKstBusinessDateString();

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: INDEX_CODES[tab],
      FID_INPUT_DATE_1: yesterday,
      FID_INPUT_DATE_2: yesterday,
      FID_PERIOD_DIV_CODE: 'D',
    });

    debug.requestParams = Object.fromEntries(params.entries());

    const res = await fetch(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params.toString()}`,
      {
        headers: kisHeaders(token, 'FHKUP03500100'),
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      debug.error = `HTTP ${res.status}`;
      return { amount: null, debug };
    }

    const data = (await res.json()) as {
      rt_cd?: string;
      msg_cd?: string;
      msg1?: string;
      output2?: Array<{ acml_tr_pbmn?: string; stck_bsop_date?: string }>;
    };

    debug.rtCd = data.rt_cd;
    debug.msgCd = data.msg_cd;
    debug.msg1 = data.msg1;
    debug.output2Length = data.output2?.length ?? 0;
    debug.output2Sample = data.output2?.slice(0, 3);

    if (data.rt_cd !== '0' || !data.output2?.length) {
      return { amount: null, debug };
    }

    const selected = pickLargestValidAmountRow(data.output2);
    debug.selectedRawAmount = selected?.row.acml_tr_pbmn;

    return { amount: selected?.amount ?? null, debug };
  } catch (error) {
    debug.error = error instanceof Error ? error.message : 'unknown error';
    return { amount: null, debug };
  }
}

async function fetchMarketTradingData(
  tab: MarketTab,
): Promise<{ data: TradingData | null; debug: Record<string, DebugInfo>; error?: string }> {
  const index = await fetchIndexPrice(tab);

  if (index.amount === null) {
    return {
      data: null,
      debug: { index: index.debug },
      error: `${tab} 지수 거래대금을 가져오지 못했습니다.`,
    };
  }

  const sameTime = await fetchYesterdaySameTimeAmount(tab);
  const closing = sameTime.amount === null ? await fetchYesterdayClosingAmount(tab) : null;
  const yesterdayAmount = sameTime.amount ?? closing?.amount;

  const debug = { index: index.debug, yesterdaySameTime: sameTime.debug, yesterdayClosing: closing?.debug ?? {} };

  if (yesterdayAmount === null || yesterdayAmount === undefined) {
    return { data: null, debug, error: `${tab} 전일 거래대금 데이터를 가져올 수 없습니다.` };
  }

  return {
    data: { indexCode: INDEX_CODES[tab], accumulatedAmount: index.amount, yesterdaySameTimeAmount: yesterdayAmount },
    debug,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const debugEnabled = req.query.debug === '1';

  try {
    const [kospiResult, kosdaqResult] = await Promise.all([
  fetchMarketTradingData('KOSPI'),
  fetchMarketTradingData('KOSDAQ'),
]);

const anyError = kospiResult.error ?? kosdaqResult.error;

res.status(anyError ? 500 : 200).json({
  ...(kospiResult.data ? { kospi: kospiResult.data } : {}),
  ...(kosdaqResult.data ? { kosdaq: kosdaqResult.data } : {}),
  ...(anyError ? { error: anyError } : {}),
  serverTimeKst: { date: formatKstDate(getKstNow()), time: formatKstTime(getKstNow()) },
  ...(debugEnabled
    ? { debug: { userAgent: req.headers['user-agent'] ?? '', kospi: kospiResult.debug, kosdaq: kosdaqResult.debug } }
    : {}),
});
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to fetch market trading data',
      ...(debugEnabled
        ? {
            debug: {
              userAgent: req.headers['user-agent'] ?? '',
            },
          }
        : {}),
    });
  }
}