import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();
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