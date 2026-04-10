import { getStore } from '@netlify/blobs';

export interface PageView {
  path: string;
  referrer: string;
  userAgent: string;
  visitorId: string;
  timestamp: number;
  country?: string;
  city?: string;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  views: number;
  uniqueVisitors: Set<string> | string[];
  pages: Record<string, number>;
  referrers: Record<string, number>;
  devices: Record<string, number>;
  countries: Record<string, number>;
}

function getDeviceType(ua: string): string {
  if (/mobile|android|iphone|ipad/i.test(ua)) return 'Mobile';
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  return 'Desktop';
}

function getBrowser(ua: string): string {
  if (/edg/i.test(ua)) return 'Edge';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  if (/firefox/i.test(ua)) return 'Firefox';
  return 'Other';
}

function getDateKey(ts: number): string {
  return new Date(ts).toISOString().split('T')[0];
}

export async function recordPageView(event: PageView, countryHint?: string) {
  const store = getStore('analytics');
  const dateKey = getDateKey(event.timestamp);
  const blobKey = `daily/${dateKey}`;

  let stats: any;
  try {
    const existing = await store.get(blobKey);
    stats = existing ? JSON.parse(existing) : null;
  } catch {
    stats = null;
  }

  if (!stats) {
    stats = {
      date: dateKey,
      views: 0,
      uniqueVisitors: [],
      pages: {},
      referrers: {},
      devices: {},
      browsers: {},
      countries: {},
    };
  }

  stats.views++;

  // Unique visitors
  if (!stats.uniqueVisitors.includes(event.visitorId)) {
    stats.uniqueVisitors.push(event.visitorId);
  }

  // Pages
  stats.pages[event.path] = (stats.pages[event.path] || 0) + 1;

  // Referrers
  const ref = event.referrer || 'Direct';
  let refDomain = 'Direct';
  if (ref !== 'Direct') {
    try { refDomain = new URL(ref).hostname; } catch { refDomain = ref; }
  }
  stats.referrers[refDomain] = (stats.referrers[refDomain] || 0) + 1;

  // Device
  const device = getDeviceType(event.userAgent);
  stats.devices[device] = (stats.devices[device] || 0) + 1;

  // Browser
  const browser = getBrowser(event.userAgent);
  stats.browsers[browser] = (stats.browsers[browser] || 0) + 1;

  // Country (from Netlify geo header)
  const country = countryHint || 'Unknown';
  stats.countries[country] = (stats.countries[country] || 0) + 1;

  await store.set(blobKey, JSON.stringify(stats));
}

export async function getStats(days: number = 30): Promise<any[]> {
  const store = getStore('analytics');
  const results: any[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];

    try {
      const data = await store.get(`daily/${dateKey}`);
      if (data) {
        const parsed = JSON.parse(data);
        // Convert uniqueVisitors array to count for response
        parsed.uniqueVisitorCount = parsed.uniqueVisitors?.length || 0;
        delete parsed.uniqueVisitors; // Don't send visitor IDs to frontend
        results.push(parsed);
      }
    } catch {
      // No data for this day
    }
  }

  return results;
}
