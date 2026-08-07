import { Redis } from '@upstash/redis';

export const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
});
export const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
export type MarketTab = 'KOSPI' | 'KOSDAQ';

export const INDEX_CODES: Record<MarketTab, string> = {
    KOSPI: '0001',
    KOSDAQ: '1001',
};

const TOKEN_REDIS_KEY = 'kis:access_token';
let tokenRequestInFlight: Promise<string> | null = null;

async function requestNewToken(): Promise<string> {
    const appkey = process.env.KIS_APPKEY;
    const appsecret = process.env.KIS_APPSECRET;

    if (!appkey || !appsecret) {
        throw new Error('KIS environment variables are missing');
    }

    const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'client_credentials', appkey, appsecret }),
    });

    if (!res.ok) {
        throw new Error(`KIS token request failed: ${res.status}`);
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };

    if (!data.access_token || !data.expires_in) {
        throw new Error('KIS token response is invalid');
    }

    const ttlSeconds = data.expires_in - 60;
    await redis.set(TOKEN_REDIS_KEY, data.access_token, { ex: ttlSeconds });

    return data.access_token;
}

export async function getAccessToken(): Promise<string> {
    const cached = await redis.get<string>(TOKEN_REDIS_KEY);
    if (cached) {
        return cached;
    }

    if (!tokenRequestInFlight) {
        tokenRequestInFlight = requestNewToken().finally(() => {
            tokenRequestInFlight = null;
        });
    }

    return tokenRequestInFlight;
}

export function getKstNow(): Date {
    return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

export function formatKstDate(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

export function toMinutesSinceMidnight(hms: string): number {
    const hour = Number(hms.slice(0, 2));
    const minute = Number(hms.slice(2, 4));
    return hour * 60 + minute;
}

export function parseKisAmountIn100Million(value: string | undefined): number | null {
    const rawAmount = Number(value);
    const amountIn100Million = rawAmount / 100;

    return Number.isFinite(amountIn100Million) && amountIn100Million > 0
        ? amountIn100Million
        : null;
}

export function kisHeaders(token: string, trId: string) {
    return {
        authorization: `Bearer ${token}`,
        appkey: process.env.KIS_APPKEY ?? '',
        appsecret: process.env.KIS_APPSECRET ?? '',
        tr_id: trId,
        custtype: 'P',
        'Content-Type': 'application/json; charset=utf-8',
    };
}

export interface DebugInfo {
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

export async function fetchIndexPrice(
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