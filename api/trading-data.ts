/// <reference types="node" />

import type { VercelRequest, VercelResponse } from '@vercel/node';

const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';

type MarketTab = 'KOSPI' | 'KOSDAQ';

const INDEX_CODES: Record<MarketTab, string> = {
  KOSPI: '0001',
  KOSDAQ: '1001',
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function isMarketTab(value: unknown): value is MarketTab {
  return value === 'KOSPI' || value === 'KOSDAQ';
}

function getYesterdayDateString(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);

  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}${m}${d}`;
}

function parseKisAmountIn100Million(value: string | undefined): number | null {
  const amount = Number(value);
  const amountIn100Million = amount / 100;

  return Number.isFinite(amountIn100Million) && amountIn100Million > 0
    ? amountIn100Million
    : null;
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
    throw new Error('KIS token request failed');
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

async function fetchIndexPrice(tab: MarketTab): Promise<number> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'U',
    FID_INPUT_ISCD: INDEX_CODES[tab],
  });

  const res = await fetch(
    `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price?${params.toString()}`,
    { headers: kisHeaders(token, 'FHPUP02100000') },
  );

  if (!res.ok) {
    throw new Error('KIS index price request failed');
  }

  const data = (await res.json()) as {
    rt_cd?: string;
    output?: { acml_tr_pbmn?: string };
  };

  if (data.rt_cd !== '0') {
    throw new Error('KIS index price response failed');
  }

  const amount = parseKisAmountIn100Million(data.output?.acml_tr_pbmn);

  if (amount === null) {
    throw new Error('KIS index trading amount is empty');
  }

  return amount;
}

async function fetchYesterdaySameTimeAmount(
  tab: MarketTab,
): Promise<number | null> {
  try {
    const token = await getAccessToken();
    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_ETC_CLS_CODE: '0',
      FID_INPUT_ISCD: INDEX_CODES[tab],
      FID_INPUT_HOUR_1: '30',
      FID_PW_DATA_INCU_YN: 'Y',
    });

    const res = await fetch(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice?${params.toString()}`,
      { headers: kisHeaders(token, 'FHKUP03500200') },
    );

    if (!res.ok) return null;

    const data = (await res.json()) as {
      rt_cd?: string;
      output2?: Array<{ acml_tr_pbmn?: string }>;
    };

    if (data.rt_cd !== '0' || !data.output2?.length) return null;

    const last = data.output2[data.output2.length - 1];
    return parseKisAmountIn100Million(last.acml_tr_pbmn);
  } catch {
    return null;
  }
}

async function fetchYesterdayClosingAmount(
  tab: MarketTab,
): Promise<number | null> {
  try {
    const token = await getAccessToken();
    const yesterday = getYesterdayDateString();

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: INDEX_CODES[tab],
      FID_INPUT_DATE_1: yesterday,
      FID_INPUT_DATE_2: yesterday,
      FID_PERIOD_DIV_CODE: 'D',
    });

    const res = await fetch(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params.toString()}`,
      { headers: kisHeaders(token, 'FHKUP03500100') },
    );

    if (!res.ok) return null;

    const data = (await res.json()) as {
      rt_cd?: string;
      output2?: Array<{ acml_tr_pbmn?: string }>;
    };

    if (data.rt_cd !== '0' || !data.output2?.length) return null;

    return parseKisAmountIn100Million(data.output2[0].acml_tr_pbmn);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const tab = req.query?.tab ?? 'KOSPI';

  if (!isMarketTab(tab)) {
    res.status(400).json({ error: 'Invalid market tab' });
    return;
  }

  try {
    const todayAmount = await fetchIndexPrice(tab);
    const yesterdayAmount =
      (await fetchYesterdaySameTimeAmount(tab)) ??
      (await fetchYesterdayClosingAmount(tab)) ??
      todayAmount;

    res.status(200).json({
      accumulatedAmount: todayAmount,
      yesterdaySameTimeAmount: yesterdayAmount,
    });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to fetch market trading data',
    });
  }
}