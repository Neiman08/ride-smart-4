/**
 * Ride Smart 4.0 — Brain Engine (Pattern Learning)
 *
 * This is the real AI brain. Not ML in the traditional sense,
 * but a pattern detection + weighted memory system that:
 *
 * 1. Learns which zones produce GODLIKE orders at which hours
 * 2. Detects earning patterns (best days, hours, weather combos)
 * 3. Predicts optimal positioning based on driver's own history
 * 4. Combines live signals (flights, events, surge) with history
 * 5. Generates a real $/hr prediction for each zone per hour
 *
 * All data is per-driver (stored in their own history).
 * No ML libraries needed — this is statistical pattern detection.
 */

// ── ZONE HOUR MATRIX ──────────────────────────────────────
// Learns best zone × hour combinations from driver history
export class ZoneHourMatrix {
  constructor() {
    // matrix[zone][hour] = { totalPay, count, avgDpm, avgDph, acceptRate }
    this.matrix = {};
  }

  record(zone, hour, pay, dpm, dph, accepted) {
    if (!zone || hour === undefined) return;
    if (!this.matrix[zone])       this.matrix[zone] = {};
    if (!this.matrix[zone][hour]) this.matrix[zone][hour] = {
      totalPay: 0, count: 0, accepted: 0,
      dpmSum: 0, dphSum: 0,
    };
    const cell = this.matrix[zone][hour];
    cell.totalPay += pay;
    cell.count    += 1;
    cell.accepted += accepted ? 1 : 0;
    cell.dpmSum   += dpm;
    cell.dphSum   += dph;
  }

  getBestZoneForHour(hour) {
    let best = null, bestScore = -1;
    for (const [zone, hours] of Object.entries(this.matrix)) {
      const cell = hours[hour];
      if (!cell || cell.count < 3) continue; // need at least 3 data points
      const avgDph = cell.dphSum / cell.count;
      const acRate = cell.accepted / cell.count;
      const score  = avgDph * 0.7 + acRate * 100 * 0.3;
      if (score > bestScore) { bestScore = score; best = { zone, avgDph, acRate, count: cell.count }; }
    }
    return best;
  }

  getPredictedHourly(zone, hour) {
    const cell = this.matrix[zone]?.[hour];
    if (!cell || cell.count < 2) return null;
    return {
      avgDph:     Math.round(cell.dphSum / cell.count * 100) / 100,
      avgDpm:     Math.round(cell.dpmSum / cell.count * 100) / 100,
      acceptRate: Math.round(cell.accepted / cell.count * 100),
      sampleSize: cell.count,
      confidence: cell.count >= 10 ? 'HIGH' : cell.count >= 5 ? 'MEDIUM' : 'LOW',
    };
  }

  getSummary() {
    const zones = [];
    for (const [zone, hours] of Object.entries(this.matrix)) {
      const allCells = Object.values(hours);
      if (!allCells.length) continue;
      const totalCount = allCells.reduce((s, c) => s + c.count, 0);
      const avgDph     = allCells.reduce((s, c) => s + c.dphSum, 0) / totalCount;
      const bestHour   = Object.entries(hours)
        .filter(([,c]) => c.count >= 2)
        .sort((a,b) => (b[1].dphSum/b[1].count) - (a[1].dphSum/a[1].count))[0];
      zones.push({
        zone, totalOrders: totalCount,
        avgDph:   Math.round(avgDph * 100) / 100,
        bestHour: bestHour ? parseInt(bestHour[0]) : null,
        bestHourLabel: bestHour ? formatHour(parseInt(bestHour[0])) : null,
      });
    }
    return zones.sort((a, b) => b.avgDph - a.avgDph);
  }
}

// ── PATTERN DETECTOR ──────────────────────────────────────
export class PatternDetector {
  constructor(history = []) {
    this.history = history; // array of RideBrainEvent objects
  }

  // Best day of week for this driver
  bestDayOfWeek() {
    const days = Array(7).fill(null).map(() => ({ total: 0, count: 0 }));
    for (const ev of this.history) {
      const dow = new Date(ev.timestamp).getDay();
      days[dow].total += ev.dollarsPerHour || 0;
      days[dow].count += 1;
    }
    const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return days
      .map((d, i) => ({ day: labels[i], avgDph: d.count ? d.total/d.count : 0, count: d.count }))
      .sort((a, b) => b.avgDph - a.avgDph);
  }

  // Best hour of day
  bestHourOfDay() {
    const hours = Array(24).fill(null).map(() => ({ total: 0, count: 0 }));
    for (const ev of this.history) {
      const h = new Date(ev.timestamp).getHours();
      hours[h].total += ev.dollarsPerHour || 0;
      hours[h].count += 1;
    }
    return hours
      .map((h, i) => ({ hour: i, label: formatHour(i), avgDph: h.count ? h.total/h.count : 0, count: h.count }))
      .sort((a, b) => b.avgDph - a.avgDph)
      .slice(0, 6);
  }

  // Acceptance rate by zone
  acceptRateByZone() {
    const zones = {};
    for (const ev of this.history) {
      const z = ev.zone || 'Unknown';
      if (!zones[z]) zones[z] = { accepted: 0, total: 0, paySum: 0 };
      zones[z].total++;
      if (ev.quality === 'GODLIKE' || ev.quality === 'GOOD') zones[z].accepted++;
      zones[z].paySum += ev.payout || 0;
    }
    return Object.entries(zones)
      .map(([zone, d]) => ({
        zone,
        acceptRate: Math.round(d.accepted / d.total * 100),
        avgPay:     Math.round(d.paySum / d.total * 100) / 100,
        totalOrders: d.total,
      }))
      .sort((a, b) => b.avgPay - a.avgPay);
  }

  // Surge detection: did driver earn more when surge was active?
  surgeImpact() {
    const surge    = this.history.filter(e => e.surgeMultiplier > 1.1);
    const noSurge  = this.history.filter(e => !e.surgeMultiplier || e.surgeMultiplier <= 1.1);
    const avgSurge = surge.length    ? surge.reduce((s,e)=>s+(e.dollarsPerHour||0),0)/surge.length    : 0;
    const avgNorm  = noSurge.length  ? noSurge.reduce((s,e)=>s+(e.dollarsPerHour||0),0)/noSurge.length : 0;
    return {
      surgeSessions:  surge.length,
      normalSessions: noSurge.length,
      avgDphDuringSurge: Math.round(avgSurge * 100) / 100,
      avgDphNormal:      Math.round(avgNorm  * 100) / 100,
      surgeBoost: avgNorm > 0 ? Math.round((avgSurge - avgNorm) / avgNorm * 100) : 0,
    };
  }

  // Today's performance vs average
  todayVsAverage() {
    const todayStr = new Date().toISOString().slice(0,10);
    const today    = this.history.filter(e => new Date(e.timestamp).toISOString().slice(0,10) === todayStr);
    const past     = this.history.filter(e => new Date(e.timestamp).toISOString().slice(0,10) !== todayStr);
    const todayDph = today.length  ? today.reduce((s,e)=>s+(e.dollarsPerHour||0),0)/today.length  : 0;
    const avgDph   = past.length   ? past.reduce((s,e)=>s+(e.dollarsPerHour||0),0)/past.length    : 0;
    return {
      todayOrders:  today.length,
      todayAvgDph:  Math.round(todayDph * 100) / 100,
      historicAvgDph: Math.round(avgDph * 100) / 100,
      delta:        Math.round((todayDph - avgDph) * 100) / 100,
      trending:     todayDph > avgDph * 1.05 ? 'UP' : todayDph < avgDph * 0.95 ? 'DOWN' : 'FLAT',
    };
  }

  // AI recommendation: where should driver go right now?
  recommend(currentHour, liveZoneScores) {
    const matrixSummary = new ZoneHourMatrix();
    // Rebuild matrix from history
    for (const ev of this.history) {
      const h = new Date(ev.timestamp).getHours();
      matrixSummary.record(ev.zone, h, ev.payout||0, ev.dollarsPerMile||0, ev.dollarsPerHour||0,
        ev.quality === 'GODLIKE' || ev.quality === 'GOOD');
    }
    const learnedBest  = matrixSummary.getBestZoneForHour(currentHour);
    const liveTopZone  = liveZoneScores?.[0];

    // Combine learned pattern with live signal
    if (learnedBest && liveTopZone) {
      const learnedScore = learnedBest.avgDph;
      const liveScore    = liveTopZone.estimatedHourly;
      // If same zone → strong signal, if different → show both
      if (learnedBest.zone === liveTopZone.name) {
        return {
          zone:       learnedBest.zone,
          confidence: 'HIGH',
          reason:     `Your data + live signals both say ${learnedBest.zone}. Avg $${learnedBest.avgDph.toFixed(0)}/hr from ${learnedBest.count} orders at this hour.`,
        };
      }
      return {
        zone:         liveTopZone.name,
        learnedZone:  learnedBest.zone,
        confidence:   'MEDIUM',
        reason:       `Live signals: ${liveTopZone.name} (score ${liveTopZone.score}). Your history: ${learnedBest.zone} ($${learnedBest.avgDph.toFixed(0)}/hr). Consider live signal.`,
      };
    }
    if (learnedBest) return {
      zone: learnedBest.zone, confidence: 'MEDIUM',
      reason: `Based on your history: ${learnedBest.zone} averages $${learnedBest.avgDph.toFixed(0)}/hr at ${formatHour(currentHour)}.`,
    };
    return {
      zone: liveTopZone?.name || 'N/A', confidence: 'LOW',
      reason: 'Not enough history yet. Keep driving to train the AI.',
    };
  }
}

function formatHour(h) {
  return h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`;
}

export { formatHour };
