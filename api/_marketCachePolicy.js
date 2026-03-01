const IST_TIME_ZONE = 'Asia/Kolkata';
const MONDAY_OPEN_TOTAL_SECONDS = ((9 * 60) + 15) * 60;

const WEEKDAY_TO_INDEX = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

const IST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

function getIstParts(now = new Date()) {
    const tokens = IST_PARTS_FORMATTER.formatToParts(now);
    const parts = {};
    for (const token of tokens) {
        if (token.type !== 'literal') parts[token.type] = token.value;
    }

    const weekday = parts.weekday || 'Mon';
    const dayIndex = Object.prototype.hasOwnProperty.call(WEEKDAY_TO_INDEX, weekday)
        ? WEEKDAY_TO_INDEX[weekday]
        : 1;

    const hour = Number.parseInt(parts.hour || '0', 10) % 24;
    const minute = Number.parseInt(parts.minute || '0', 10);
    const second = Number.parseInt(parts.second || '0', 10);

    return {
        dayIndex,
        year: parts.year || '1970',
        month: parts.month || '01',
        day: parts.day || '01',
        hour,
        minute,
        second,
        totalSeconds: (hour * 3600) + (minute * 60) + second,
    };
}

function buildCachePolicy(now = new Date()) {
    const ist = getIstParts(now);

    // Sunday market closed: cache at CDN in 6-hour windows.
    if (ist.dayIndex === 0) {
        return {
            ttlSec: 21600,
            swrSec: 600,
            phase: 'sunday-closed-6h',
            key: `sun-${ist.year}${ist.month}${ist.day}-slot${Math.floor(ist.hour / 6)}`,
        };
    }

    // Monday pre-open: keep cache only until 09:15 IST so open forces fresh.
    if (ist.dayIndex === 1 && ist.totalSeconds < MONDAY_OPEN_TOTAL_SECONDS) {
        const ttlSec = Math.max(1, MONDAY_OPEN_TOTAL_SECONDS - ist.totalSeconds);
        return {
            ttlSec,
            swrSec: 60,
            phase: 'monday-preopen-until-0915',
            key: `mon-preopen-${ist.year}${ist.month}${ist.day}`,
        };
    }

    // Regular market behavior.
    return {
        ttlSec: 300,
        swrSec: 60,
        phase: 'market-regular-5m',
        key: `live-${ist.year}${ist.month}${ist.day}`,
    };
}

export function getMarketCachePolicy(now = new Date()) {
    const policy = buildCachePolicy(now);
    return {
        ...policy,
        cacheControl: `public, max-age=0, s-maxage=${policy.ttlSec}, stale-while-revalidate=${policy.swrSec}`,
        vercelCdnCacheControl: `s-maxage=${policy.ttlSec}, stale-while-revalidate=${policy.swrSec}`,
    };
}
