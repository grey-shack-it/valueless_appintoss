import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, getKstNow, formatKstDate, toMinutesSinceMidnight, fetchIndexPrice, MarketTab } from './_lib/kis.js';

function formatKstTime(date: Date): string {
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    return `${h}${m}`;
}

async function recordSnapshot(tab: MarketTab, dateStr: string, minutes: number, amount: number) {
    const key = `snapshot:${tab}:${dateStr}`;
    await redis.zadd(key, { score: minutes, member: `${minutes}:${amount}` });
    await redis.expire(key, 60 * 60 * 24 * 2); // 2일 뒤 자동 삭제
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const now = getKstNow();
    const todayStr = formatKstDate(now);
    const minutes = toMinutesSinceMidnight(formatKstTime(now));

    const [kospi, kosdaq] = await Promise.all([
        fetchIndexPrice('KOSPI'),
        fetchIndexPrice('KOSDAQ'),
    ]);

    const results: Array<{ tab: string; saved: boolean; amount: number | null }> = [];

    if (kospi.amount !== null) {
        await recordSnapshot('KOSPI', todayStr, minutes, kospi.amount);
        results.push({ tab: 'KOSPI', saved: true, amount: kospi.amount });
    } else {
        results.push({ tab: 'KOSPI', saved: false, amount: null });
    }

    if (kosdaq.amount !== null) {
        await recordSnapshot('KOSDAQ', todayStr, minutes, kosdaq.amount);
        results.push({ tab: 'KOSDAQ', saved: true, amount: kosdaq.amount });
    } else {
        results.push({ tab: 'KOSDAQ', saved: false, amount: null });
    }

    res.status(200).json({ date: todayStr, minutes, results });
}