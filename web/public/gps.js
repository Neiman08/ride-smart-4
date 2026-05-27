/**
 * Ride Smart 4.0 — GPS Manager
 */

const GPS = (() => {
  let _lat = null, _lng = null, _city = '', _watching = false;

  try {
    const stored = JSON.parse(localStorage.getItem('rs4_gps') || 'null');

    if (stored && stored.ts && Date.now() - stored.ts < 300000) {
      _lat = stored.lat;
      _lng = stored.lng;
      _city = stored.city || '';
    }
  } catch {}

  function save() {
    localStorage.setItem('rs4_gps', JSON.stringify({
      lat: _lat,
      lng: _lng,
      city: _city,
      ts: Date.now()
    }));
  }

  function startWatch() {
    if (_watching || !navigator.geolocation) return;

    _watching = true;

    navigator.geolocation.watchPosition(
      pos => {
        _lat = pos.coords.latitude;
        _lng = pos.coords.longitude;

        save();

        document.dispatchEvent(
          new CustomEvent('rs4:location', {
            detail: { lat: _lat, lng: _lng }
          })
        );
      },
      err => console.warn('GPS error:', err.message),
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 10000
      }
    );
  }

  function getOnce(cb) {
    if (_lat && _lng) {
      cb(_lat, _lng);
      return;
    }

    if (!navigator.geolocation) {
      cb(41.8781, -87.6298);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        _lat = pos.coords.latitude;
        _lng = pos.coords.longitude;

        save();

        cb(_lat, _lng);
      },
      () => cb(41.8781, -87.6298),
      {
        enableHighAccuracy: true,
        timeout: 8000
      }
    );
  }

  function url(base, extraParams = {}) {
    const p = new URLSearchParams({
      ...extraParams,
      t: Date.now()
    });

    if (_lat) p.set('lat', _lat.toFixed(6));
    if (_lng) p.set('lng', _lng.toFixed(6));

    return `${base}?${p.toString()}`;
  }

  return {
    get lat() { return _lat; },
    get lng() { return _lng; },
    get city() { return _city; },
    set city(v) { _city = v; },
    startWatch,
    getOnce,
    url
  };
})();

/* 👇 ESTA ES LA PARTE IMPORTANTE */
window.GPS = GPS;

/* Auto start */
GPS.startWatch();