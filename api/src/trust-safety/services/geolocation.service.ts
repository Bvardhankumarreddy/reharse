import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GeoLookup {
  country: string | null;
  region:  string | null;
  city:    string | null;
  latitude:  number | null;
  longitude: number | null;
  isVpn: boolean;
}

const EMPTY: GeoLookup = {
  country: null, region: null, city: null,
  latitude: null, longitude: null, isVpn: false,
};

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);
  private readonly cache = new Map<string, { value: GeoLookup; expires: number }>();

  constructor(private readonly config: ConfigService) {}

  /**
   * IP→geo via ip-api.com (free, no key, 45 req/min). Results cached in
   * memory for `geo.cacheMinutes` to stay under the rate limit and keep
   * the quiz START path fast (the lookup is on the hot path).
   *
   * Returns nullable fields on any error — callers should treat geo as
   * best-effort, never a gating signal on its own.
   */
  async lookup(ip: string | null | undefined): Promise<GeoLookup> {
    if (!ip || ip === '127.0.0.1' || ip === '::1') return EMPTY;
    if (this.config.get<string>('trustSafety.geo.provider') === 'none') return EMPTY;

    const cached = this.cache.get(ip);
    if (cached && cached.expires > Date.now()) return cached.value;

    const timeoutMs = Number(this.config.get('trustSafety.geo.timeoutMs') ?? 5000);
    try {
      const { data } = await axios.get(
        `http://ip-api.com/json/${encodeURIComponent(ip)}` +
        `?fields=status,country,regionName,city,lat,lon,proxy,hosting`,
        { timeout: timeoutMs },
      );
      if (!data || data.status !== 'success') {
        return this.cacheAndReturn(ip, EMPTY);
      }
      const value: GeoLookup = {
        country: data.country ?? null,
        region:  data.regionName ?? null,
        city:    data.city ?? null,
        latitude:  Number.isFinite(data.lat) ? Number(data.lat) : null,
        longitude: Number.isFinite(data.lon) ? Number(data.lon) : null,
        isVpn:   Boolean(data.proxy) || Boolean(data.hosting),
      };
      return this.cacheAndReturn(ip, value);
    } catch (e) {
      this.logger.warn(`IP lookup failed for ${ip}: ${(e as Error).message}`);
      return this.cacheAndReturn(ip, EMPTY);
    }
  }

  /**
   * Haversine great-circle distance in km. Returns Infinity when either
   * coordinate is missing so the "is nearby" predicate falls to false.
   */
  distanceKm(
    lat1: number | null, lon1: number | null,
    lat2: number | null, lon2: number | null,
  ): number {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
      return Number.POSITIVE_INFINITY;
    }
    const R = 6371;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  isWithinRadiusKm(
    lat1: number | null, lon1: number | null,
    lat2: number | null, lon2: number | null,
    radiusKm: number,
  ): boolean {
    return this.distanceKm(lat1, lon1, lat2, lon2) <= radiusKm;
  }

  private cacheAndReturn(ip: string, value: GeoLookup): GeoLookup {
    const minutes = Number(this.config.get('trustSafety.geo.cacheMinutes') ?? 60);
    this.cache.set(ip, { value, expires: Date.now() + minutes * 60_000 });
    // Drop the oldest entries when cache grows past 10k (rough cap).
    if (this.cache.size > 10_000) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    return value;
  }
}
