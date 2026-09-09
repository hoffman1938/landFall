/**
 * Prometheus-format metrics, hand-rolled.
 *
 * No client library: the exposition format is a few lines of text, and the
 * program's rule is that a new runtime dependency needs a recorded reason. A
 * scrape hits `GET /api/metrics`.
 *
 * WHAT TO ALERT ON, and why each series exists:
 *   landfall_round_settle_seconds       — the round loop is a fixed ~20s
 *                                         heartbeat. A p95 that climbs means
 *                                         settlement is falling behind the clock.
 *   landfall_settlement_failures_total  — must stay at 0. A non-zero value means
 *                                         the conservation assert fired, which
 *                                         is a money bug, not a blip.
 *   landfall_house_delta_minor_total    — cumulative operator P&L. Reconciles
 *                                         against the DB; drift means a leak.
 *   landfall_storm_reserve_minor        — the Storm Power liability fund. Going
 *                                         persistently negative is the bankroll
 *                                         alarm the Storm Reserve exists to raise.
 *   landfall_room_humans                — liquidity per room, the product's
 *                                         existential metric.
 *
 * Counters only ever increase; gauges are set from live state at scrape time.
 * Everything is process-local — with several instances, aggregate in the
 * scraper by the `instance` label rather than trying to share state here.
 */
import { INSTANCE_ID } from './log.js';

type Labels = Record<string, string>;

interface Series {
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  values: Map<string, { labels: Labels; value: number }>;
  /** histogram only */
  buckets?: number[];
  observations?: Map<string, { labels: Labels; counts: number[]; sum: number; count: number }>;
}

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function renderLabels(labels: Labels): string {
  const all = { instance: INSTANCE_ID, ...labels };
  const body = Object.entries(all)
    .map(([k, v]) => `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
  return `{${body}}`;
}

export class Metrics {
  private series = new Map<string, Series>();

  private ensure(name: string, help: string, type: Series['type'], buckets?: number[]): Series {
    let s = this.series.get(name);
    if (!s) {
      s = { help, type, values: new Map() };
      if (type === 'histogram') {
        s.buckets = buckets ?? [];
        s.observations = new Map();
      }
      this.series.set(name, s);
    }
    return s;
  }

  counter(name: string, help: string, labels: Labels = {}, by = 1): void {
    const s = this.ensure(name, help, 'counter');
    const key = labelKey(labels);
    const current = s.values.get(key);
    if (current) current.value += by;
    else s.values.set(key, { labels, value: by });
  }

  gauge(name: string, help: string, value: number, labels: Labels = {}): void {
    const s = this.ensure(name, help, 'gauge');
    s.values.set(labelKey(labels), { labels, value });
  }

  observe(name: string, help: string, buckets: number[], value: number, labels: Labels = {}): void {
    const s = this.ensure(name, help, 'histogram', buckets);
    const key = labelKey(labels);
    let obs = s.observations!.get(key);
    if (!obs) {
      obs = { labels, counts: new Array<number>(buckets.length).fill(0), sum: 0, count: 0 };
      s.observations!.set(key, obs);
    }
    for (let i = 0; i < buckets.length; i++) {
      if (value <= buckets[i]!) obs.counts[i]! += 1;
    }
    obs.sum += value;
    obs.count += 1;
  }

  /** Prometheus text exposition format (version 0.0.4). */
  render(): string {
    const out: string[] = [];
    for (const [name, s] of this.series) {
      out.push(`# HELP ${name} ${s.help}`);
      out.push(`# TYPE ${name} ${s.type}`);
      if (s.type === 'histogram') {
        for (const obs of s.observations!.values()) {
          // `counts` is already cumulative: observe() increments every bucket
          // whose upper bound the value falls under.
          for (let i = 0; i < s.buckets!.length; i++) {
            out.push(
              `${name}_bucket${renderLabels({ ...obs.labels, le: String(s.buckets![i]) })} ${obs.counts[i]!}`,
            );
          }
          out.push(`${name}_bucket${renderLabels({ ...obs.labels, le: '+Inf' })} ${obs.count}`);
          out.push(`${name}_sum${renderLabels(obs.labels)} ${obs.sum}`);
          out.push(`${name}_count${renderLabels(obs.labels)} ${obs.count}`);
        }
      } else {
        for (const v of s.values.values()) {
          out.push(`${name}${renderLabels(v.labels)} ${v.value}`);
        }
      }
    }
    return out.join('\n') + '\n';
  }
}

/** One registry per process. */
export const metrics = new Metrics();

/** Settlement latency buckets, in seconds — a round is a ~20s fixed loop. */
export const SETTLE_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];
