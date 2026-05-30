/**
 * Ride Smart 4.0 — AI Engine
 * "Go Here Now" dynamic recommendations every 3 minutes
 * Crosses zones + flights + events + weather + time of day
 * Runs in background on all pages
 */

const RS4_AI = {
  interval: null,
  countdown: null,
  REFRESH_SECS: 180, // 3 minutes
  secsLeft: 180,
  lastRec: null,

  start() {
    this.refresh();
    this.interval = setInterval(() => this.refresh(), this.REFRESH_SECS * 1000);
    this.startCountdown();
  },

  stop() {
    clearInterval(this.interval);
    clearInterval(this.countdown);
  },

  startCountdown() {
    this.secsLeft = this.REFRESH_SECS;
    clearInterval(this.countdown);
    this.countdown = setInterval(() => {
      this.secsLeft--;
      if (this.secsLeft <= 0) {
        this.secsLeft = this.REFRESH_SECS;
      }
      this.updateCountdownUI();
    }, 1000);
  },

  updateCountdownUI() {
    const el = document.getElementById('aiCountdown');
    if (el) {
      const m = Math.floor(this.secsLeft / 60);
      const s = this.secsLeft % 60;
      el.textContent = `Next update: ${m}:${String(s).padStart(2,'0')}`;
    }
  },

  async refresh() {
    const API = window.RS4_API || 'https://ride-smart-4.onrender.com';
    const lat = (typeof GPS !== 'undefined' && GPS.lat) ? GPS.lat : null;
    const q = lat ? `?lat=${lat}&lng=${GPS.lng}` : '';

    try {
      // Use backend AI recommendation as primary source
      const recData = await fetch(`${API}/api/ai/recommendation${q}`).then(r => r.json()).catch(() => null);
      
      if (recData?.success && recData.recommendation) {
        const rec = {
          zone: recData.recommendation.zone,
          lat: recData.recommendation.lat,
          lng: recData.recommendation.lng,
          score: recData.recommendation.score,
          estimatedHourly: recData.recommendation.estimatedHourly,
          reasons: recData.recommendation.reasons || [],
          confidence: recData.recommendation.confidence,
          action: recData.recommendation.action,
          timestamp: Date.now(),
        };
        this.lastRec = rec;
        this.updateUI(rec);
        this.startCountdown();
        return;
      }

      // Fallback: compute locally from zones
      const [zonesR, eventsR, surgeR] = await Promise.all([
        fetch(`${API}/api/zones${q}`).then(r => r.json()),
        fetch(`${API}/api/events${q}`).then(r => r.json()),
        fetch(`${API}/api/surge`).then(r => r.json()),
      ]);

      const zones   = zonesR.bestZones || [];
      const events  = eventsR.events   || [];
      const surge   = surgeR.current?.multiplier || 1.0;
      const surgeActive = surgeR.isSurgeActive || false;

      if (!zones.length) return;

      const rec = this.computeRecommendation(zones, events, surge, surgeActive, zonesR.weather);
      this.lastRec = rec;
      this.updateUI(rec);
      this.startCountdown();

    } catch (e) {
      console.warn('[AI Engine]', e.message);
    }
  },

  computeRecommendation(zones, events, surge, surgeActive, weather) {
    const hour = new Date().getHours();
    const top = zones[0];
    if (!top) return null;

    // Score each zone with time-weighted signals
    const scored = zones.map(z => {
      let score = z.score;
      // Bonus: surge active and zone has activity
      if (surgeActive && z.score > 50) score += 12;
      // Bonus: event in zone right now
      const zoneEvent = events.find(e =>
        e.surgeWindow && e.venueLat &&
        Math.abs(e.venueLat - z.lat) < 0.15 &&
        Math.abs(e.venueLng - z.lng) < 0.15
      );
      if (zoneEvent) score += 18;
      // Bonus: airport with passengers
      if (z.expectedFlightRiders > 30) score += 10;
      // Night bonus
      if ((hour >= 22 || hour <= 3) && z.name.toLowerCase().includes('downtown')) score += 8;
      return { ...z, aiScore: Math.min(100, score) };
    }).sort((a, b) => b.aiScore - a.aiScore);

    const best = scored[0];
    const reasons = [];

    if (best.expectedFlightRiders > 20)
      reasons.push(`✈️ ~${best.expectedFlightRiders} flight riders`);
    if (best.expectedEventRiders > 20)
      reasons.push(`🎵 ~${best.expectedEventRiders} event riders`);
    if (surgeActive)
      reasons.push(`⚡ ${surge.toFixed(1)}x surge active`);
    if ((best.insights || []).length)
      reasons.push(...(best.insights || []).slice(0, 2));

    const confidence = best.aiScore >= 75 ? 'HIGH' : best.aiScore >= 55 ? 'MEDIUM' : 'LOW';

    return {
      zone: best.name,
      lat: best.lat,
      lng: best.lng,
      score: best.aiScore,
      estimatedHourly: best.estimatedHourly,
      reasons: reasons.slice(0, 3),
      confidence,
      action: best.action || 'GO NOW',
      timestamp: Date.now(),
    };
  },

  updateUI(rec) {
    if (!rec) return;

    // Update any "Go Here Now" card on page
    const nameEl = document.getElementById('aiRecZone');
    const reasonEl = document.getElementById('aiRecReason');
    const scoreEl = document.getElementById('aiRecScore');
    const btnEl = document.getElementById('aiRecBtn');

    if (nameEl) nameEl.textContent = rec.zone;
    if (reasonEl) reasonEl.textContent = rec.reasons.join(' · ') || 'Strong signals detected';
    if (scoreEl) {
      scoreEl.textContent = rec.score;
      scoreEl.style.color = rec.score >= 75 ? 'var(--green)' : rec.score >= 55 ? 'var(--amber)' : 'var(--red)';
    }
    if (btnEl) {
      btnEl.onclick = () => {
        window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${rec.lat},${rec.lng}&travelmode=driving`;
      };
    }

    // Show notification if score is very high
    if (rec.score >= 80 && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('🎯 Ride Smart — Go Here Now!', {
        body: `${rec.zone} · Score ${rec.score} · $${rec.estimatedHourly}/hr est.`,
        icon: '/icon.png',
      });
    }

    // Dispatch event for any listeners
    window.dispatchEvent(new CustomEvent('rs4:recommendation', { detail: rec }));
  },

  getLastRec() {
    return this.lastRec;
  }
};

// Auto-start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => RS4_AI.start());
} else {
  RS4_AI.start();
}
