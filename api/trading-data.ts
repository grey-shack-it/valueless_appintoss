/// <reference types="node" />

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  redis,
  getAccessToken,
  kisHeaders,
  KIS_BASE_URL,
  INDEX_CODES,
  MarketTab,
  parseKisAmountIn100Million,
  getKstNow,
  formatKstDate,
  toMinutesSinceMidnight,
  fetchIndexPrice,
  DebugInfo,
} from './_lib/kis.js';

async function getSnapshotAtOrBefore(
  tab: MarketTab,
  dateStr: string,
  minutes: number,
): Promise<number | null> {
  const key = `snapshot:${tab}:${dateStr}`;
  try {
    const results = await redis.zrange<string[]>(key, minutes, '-inf', {
      byScore: true,
      rev: true,
      offset: 0,
      count: 1,
    });
    if (!results.length) return null;
    const [, amountStr] = results[0].split(':');
    const amount = Number(amountStr);
    return Number.isFinite(amount) ? amount : null;
  } catch {
    return null;
  }
}

async function getRecentSnapshot(
  tab: MarketTab,
  nowMinutes: number,
  maxDaysBack = 16,
): Promise<{ amount: number | null; sourceDate: string | null }> {
  const base = getKstNow();

  for (let i = 1; i <= maxDaysBack; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = formatKstDate(d);

    const amount = await getSnapshotAtOrBefore(tab, dateStr, nowMinutes);
    if (amount !== null) {
      return { amount, sourceDate: dateStr };
    }
  }

  return { amount: null, sourceDate: null };
}

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

interface TradingData {
  indexCode: string;
  accumulatedAmount: number;
  yesterdaySameTimeAmount: number;
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

function pickSameTimeYesterdayRow(
  rows: Array<{ acml_tr_pbmn?: string; stck_bsop_date?: string; stck_cntg_hour?: string }> | undefined,
  yesterday: string,
  nowHms: string,
): { amount: number } | null {
  if (!rows?.length) return null;

  let selectedAmount: number | null = null;
  let selectedHms = '';

  for (const row of rows) {
    if (row.stck_bsop_date !== yesterday) continue;

    const hms = row.stck_cntg_hour;
    if (!hms) continue;
    if (Number(hms) > 235959) continue;
    if (hms > nowHms) continue;
    if (hms <= selectedHms) continue;

    const amount = parseKisAmountIn100Million(row.acml_tr_pbmn);
    if (amount === null) continue;

    selectedAmount = amount;
    selectedHms = hms;
  }

  return selectedAmount === null ? null : { amount: selectedAmount };
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
    debug.output2Sample = data.output2?.slice(0, 3);

    if (data.rt_cd !== '0' || !data.output2?.length) {
      return { amount: null, debug };
    }

    const yesterday = getPreviousKstBusinessDateString();
    const nowHms = formatKstTime(getKstNow());
    const selected = pickSameTimeYesterdayRow(data.output2, yesterday, nowHms);
    debug.selectedRawAmount = String(selected?.amount ?? '');

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
): Promise<{ data: TradingData | null; debug: Record<string, unknown>; error?: string }> {
  const index = await fetchIndexPrice(tab);

  if (index.amount === null) {
    return {
      data: null,
      debug: { index: index.debug },
      error: `${tab} 지수 거래대금을 가져오지 못했습니다.`,
    };
  }

  const now = getKstNow();
  const todayStr = formatKstDate(now);
  const yesterdayStr = getPreviousKstBusinessDateString();
  const nowMinutes = toMinutesSinceMidnight(formatKstTime(now));

  let yesterdayAmount: number | null = null;
  let yesterdaySource: string | null = null;

  // 1순위: 우리가 직접 쌓은 진짜 "어제 동시간" 스냅샷
  const recent = await getRecentSnapshot(tab, nowMinutes);
  yesterdayAmount = recent.amount;
  if (yesterdayAmount !== null) yesterdaySource = 'own-snapshot';

  // 2순위: KIS 최근 50분 배열
  let sameTimeDebug: unknown = null;
  if (yesterdayAmount === null) {
    const sameTime = await fetchYesterdaySameTimeAmount(tab);
    sameTimeDebug = sameTime.debug;
    if (sameTime.amount !== null) {
      yesterdayAmount = sameTime.amount;
      yesterdaySource = 'kis-array';
    }
  }

  // 3순위: 어제 하루 총합 (최후 수단)
  let closingDebug: unknown = null;
  if (yesterdayAmount === null) {
    const closing = await fetchYesterdayClosingAmount(tab);
    closingDebug = closing.debug;
    if (closing.amount !== null) {
      yesterdayAmount = closing.amount;
      yesterdaySource = 'kis-daily-total';
    }
  }

  const debug = { index: index.debug, yesterdaySameTime: sameTimeDebug, yesterdayClosing: closingDebug, yesterdaySource, yesterdaySnapshotDate: recent.sourceDate, };

  if (yesterdayAmount === null) {
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