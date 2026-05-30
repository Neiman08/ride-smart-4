/**
 * Ride Smart 4.0 — Intelligence Engine v2.1
 * Fix: insights now show the strongest real nearby event instead of repeating
 * global attendees/riders totals for every zone.
 */

export function calculateZoneScore(zone) {
  const {
    flights = 0,
    traffic = 50,
    weather = 60,
    events = 0,
    concerts = 0,
    sports = 0,
    peakHour = 50,
    estimatedDemand = 50,
    driverSaturation = 50,
    estimatedHourly = 25,
    driveMinutes = 0,
    airportQueue = 0,
    surgeMultiplier = 1.0,
    historicHourly = 25,
    predictedHourly = 25,
    rainIntensity = 0,

    passengerLoad = 0,
    expectedFlightRiders = 0,
    eventAttendees = 0,
    expectedEventRiders = 0,
    eventRideImpact = 0,
    delayedFlights = 0,
    concertCapacity = 0,
    sportsCrowd = 0,

    nearbyEvents = [],
  } = zone;

  let score = 0;

  score += Math.min(100, estimatedHourly * 2.4) * 0.20;
  score += Math.min(100, predictedHourly * 2.4) * 0.10;
  score += Math.min(100, historicHourly * 2.4) * 0.10;

  score += estimatedDemand * 0.15;
  score += peakHour * 0.10;
  score += weather * 0.05;
  score += flights * 0.05;

  if (passengerLoad > 0) {
    const riderScore = Math.min(30, expectedFlightRiders / 10);
    score += riderScore;
    if (delayedFlights > 0) score += Math.min(8, delayedFlights * 2);
  } else if (flights > 50) {
    score += Math.min(15, flights * 0.15);
  }

  if (airportQueue > 60) score += 8;
  else if (airportQueue > 30) score += 4;

  if (eventAttendees > 0) {
    const eventScore = Math.min(25, expectedEventRiders / 8);
    score += eventScore;
  } else if (events > 0) {
    score += events * 0.08;
  }

  if (concerts > 0) score += Math.min(12, concertCapacity / 2000);
  if (sports > 0) score += Math.min(12, sportsCrowd * 0.12);
  if (eventRideImpact > 70) score += 10;

  if (surgeMultiplier > 1.5) score += 15;
  else if (surgeMultiplier > 1.2) score += 8;
  else if (surgeMultiplier > 1.0) score += 3;

  if (rainIntensity > 60) score += 12;
  else if (rainIntensity > 30) score += 6;

  const trafficPen = traffic >= 90 ? traffic * 0.13 : traffic * 0.07;
  score -= trafficPen;
  score -= driverSaturation * 0.15;
  score -= driveMinutes > 0 ? Math.min(20, driveMinutes * 0.45) : 0;

  if (estimatedHourly >= 38 && driverSaturation <= 45) score += 6;
  if (passengerLoad > 200 && driveMinutes <= 20) score += 6;
  if (eventAttendees > 5000 && peakHour >= 70) score += 5;
  if (traffic >= 90 && driveMinutes >= 30) score -= 8;

  score = Math.max(0, Math.min(100, score));

  const insights = [];

  if (passengerLoad > 100) {
    insights.push(`✈️ ~${Number(passengerLoad).toLocaleString()} pax arriving → ~${Number(expectedFlightRiders).toLocaleString()} riders`);
  } else if (flights >= 65) {
    insights.push('✈️ Strong flight activity');
  }

  if (delayedFlights > 2) {
    insights.push(`⏰ ${delayedFlights} delayed flights — stranded pax`);
  }

  const topEvent = Array.isArray(nearbyEvents) && nearbyEvents.length
    ? [...nearbyEvents].sort((a, b) => (b.expectedRiders || 0) - (a.expectedRiders || 0))[0]
    : null;

  if (topEvent && topEvent.attendees > 0) {
    const eventName = topEvent.name || topEvent.venueName || 'Nearby event';
    const shortName = eventName.length > 32 ? eventName.slice(0, 32) + '…' : eventName;

    insights.push(
      `🎵 ${shortName}: ~${Number(topEvent.attendees).toLocaleString()} attending → ~${Number(topEvent.expectedRiders || 0).toLocaleString()} riders`
    );
  } else if (eventAttendees > 1000) {
    insights.push(
      `🎵 Event demand nearby: ~${Number(eventAttendees).toLocaleString()} total attendees → ~${Number(expectedEventRiders).toLocaleString()} riders`
    );
  } else if (eventRideImpact > 50) {
    insights.push('🎵 Event surge window active');
  }

  if (driverSaturation <= 35) insights.push('✅ Low driver saturation');
  else if (driverSaturation >= 80) insights.push('⚠️ Too many drivers here');

  if (estimatedHourly >= 38) insights.push(`💰 Est $${estimatedHourly}/hr — premium zone`);
  if (traffic >= 90) insights.push('🚦 Heavy traffic — avoid');
  if (rainIntensity > 40) insights.push('🌧️ Rain surge — high demand');
  if (surgeMultiplier > 1.3) insights.push(`🔥 ${surgeMultiplier.toFixed(1)}x surge active`);

  let action = 'WAIT';
  if (score >= 75 && traffic < 85 && driveMinutes <= 28) action = 'GO NOW';
  else if (score >= 62) action = 'WATCH';
  else if (score < 40) action = 'AVOID';

  const risk = (traffic >= 85 || driverSaturation >= 75 || driveMinutes >= 30)
    ? (traffic >= 90 && driverSaturation >= 80 ? 'HIGH' : 'MEDIUM')
    : 'LOW';

  return {
    score: Math.round(score),
    insights,
    action,
    risk,
  };
}

export function predictHourly(zone, hour, dow) {
  const {
    estimatedHourly = 25,
    historicHourly = 25,
    surgeMultiplier = 1.0,
    concerts = 0,
    sports = 0,
    flights = 0,
    passengerLoad = 0,
  } = zone;

  let p = historicHourly;

  if (hour >= 7 && hour <= 9) p *= 1.15;
  if (hour >= 16 && hour <= 19) p *= 1.28;
  if (hour >= 22 || hour <= 2) p *= 1.22;
  if (dow === 5 || dow === 6) p *= 1.12;

  if (concerts > 70) p *= 1.22;
  if (sports > 70) p *= 1.18;
  if (flights > 70 || passengerLoad > 200) p *= 1.12;

  p *= surgeMultiplier;

  return Math.round(p * 10) / 10;
}

export function detectSurge(zones) {
  const hot = zones.filter(z => z.score >= 72).sort((a, b) => b.score - a.score);

  const surge = hot.filter(z =>
    (z.surgeMultiplier || 1) > 1.2 ||
    (z.eventRideImpact || 0) > 60 ||
    (z.expectedFlightRiders || 0) > 50
  );

  return {
    active: surge.length > 0,
    count: surge.length,
    topZone: surge[0] || hot[0] || null,
    multiplier: surge[0]?.surgeMultiplier || 1.0,
    reason: surge[0]
      ? (
          surge[0].expectedFlightRiders > 50
            ? `~${Number(surge[0].expectedFlightRiders).toLocaleString()} flight riders`
            : surge[0].expectedEventRiders > 30
              ? `~${Number(surge[0].expectedEventRiders).toLocaleString()} event riders`
              : `${surge[0].surgeMultiplier}x surge`
        )
      : 'Normal demand',
  };
}