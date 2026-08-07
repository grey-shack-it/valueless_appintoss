import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, getAccessToken, kisHeaders, KIS_BASE_URL, INDEX_CODES, MarketTab, parseKisAmountIn100Million, getKstNow, formatKstDate, toMinutesSinceMidnight } from './_lib/kis.js';

async function fetchIntradayBatch(tab: MarketTab, hourParam: string, todayStr: string) {
    const token = await getAccessToken();
    const params = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: 'U',
        FID_ETC_CLS_CODE: '0',
        FID_INPUT_ISCD: INDEX_CODES[tab],
        FID_INPUT_HOUR_1: hourParam,
        FID_PW_DATA_INCU_YN: 'N', // 오늘 데이터만, 어제 마감마커 안 섞이게
    });

    const res = await fetch(
        `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice?${params.toString()}`,
        { headers: kisHeaders(token, 'FHPUP02110200'), cache: 'no-store' },
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
        rt_cd?: string;
        output2?: Array<{ stck_bsop_date?: string; stck_cntg_hour?: string; acml_tr_pbmn?: string }>;
    };
    if (data.rt_cd !== '0' || !data.output2) return [];

    return data.output2
        .filter((row) => row.stck_bsop_date === todayStr && row.stck_cntg_hour && Number(row.stck_cntg_hour) <= 235959)
        .map((row) => ({ hms: row.stck_cntg_hour as string, amount: parseKisAmountIn100Million(row.acml_tr_pbmn) ?? 0 }));
}

async function fetchFullDay(tab: MarketTab, todayStr: string): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    let cursor = '154000';

    for (let i = 0; i < 10; i++) {
        const batch = await fetchIntradayBatch(tab, cursor, todayStr);
        if (batch.length === 0) break;

        let earliest = cursor;
        for (const { hms, amount } of batch) {
            const minutes = toMinutesSinceMidnight(hms);
            if (!result.has(minutes)) result.set(minutes, amount);
            if (hms < earliest) earliest = hms;
        }

        if (earliest === cursor || earliest <= '090000') break;
        cursor = earliest;
    }

    return result;
}

async function saveTab(tab: MarketTab, todayStr: string) {
    const dayData = await fetchFullDay(tab, todayStr);
    if (dayData.size === 0) return { tab, saved: 0 };

    const key = `snapshot:${tab}:${todayStr}`;
    const members = Array.from(dayData.entries()).map(([minutes, amount]) => ({
        score: minutes,
        member: `${minutes}:${amount}`,
    }));

    await redis.del(key);
    const [first, ...rest] = members;
    await redis.zadd(key, first, ...rest);
    await redis.expire(key, 60 * 60 * 24 * 2); // 2일 뒤 자동 삭제

    return { tab, saved: members.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const todayStr = formatKstDate(getKstNow());
    const results = await Promise.all([saveTab('KOSPI', todayStr), saveTab('KOSDAQ', todayStr)]);

    res.status(200).json({ date: todayStr, results });
}