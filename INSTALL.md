# 🚀 Ride Smart 4.0 — INSTALL GUIDE
# Todo listo para probar hoy mismo

## ESTRUCTURA DEL PAQUETE

```
rs4-final/
├── android/java/com/ridesmart/ai/   ← Java files para Android Studio
│   ├── RideSmartAccessibilityService.java  ← REEMPLAZAR
│   ├── engine/
│   │   ├── RideScoringEngine.java          ← REEMPLAZAR (5 niveles + live data)
│   │   ├── AutoAcceptManager.java          ← REEMPLAZAR (validación completa)
│   │   └── RideAnalyzer.java               ← REEMPLAZAR (cadena completa)
│   ├── filters/
│   │   └── RideFilterConfig.java           ← REEMPLAZAR (14 filtros)
│   ├── overlay/
│   │   └── OverlayManager.java             ← REEMPLAZAR (Indigo minimal)
│   ├── utils/
│   │   └── ConfigManager.java              ← REEMPLAZAR (lee todos los filtros)
│   └── network/
│       └── LiveDataManager.java            ← NUEVO (crea carpeta network/)
│
├── web/public/                      ← Páginas HTML del WebView
│   ├── index.html, filters.html, shift.html...
│   └── styles/theme.css            ← Indigo Dark theme
│
└── backend/                         ← Servidor Node.js (RS4 API)
    ├── server.js
    ├── routes/  (zones, events, ev, surge, predict, airports)
    └── services/ (intelligenceEngine, locationEngine...)
```

---

## PASO 1 — ANDROID STUDIO (15 min)

### 1a. Reemplazar archivos Java

Copia cada archivo a su ruta exacta en tu proyecto:

| Archivo | Ruta destino |
|---|---|
| `RideSmartAccessibilityService.java` | `app/src/main/java/com/ridesmart/ai/` |
| `engine/RideScoringEngine.java` | `app/src/main/java/com/ridesmart/ai/engine/` |
| `engine/AutoAcceptManager.java` | `app/src/main/java/com/ridesmart/ai/engine/` |
| `engine/RideAnalyzer.java` | `app/src/main/java/com/ridesmart/ai/engine/` |
| `filters/RideFilterConfig.java` | `app/src/main/java/com/ridesmart/ai/filters/` |
| `overlay/OverlayManager.java` | `app/src/main/java/com/ridesmart/ai/overlay/` |
| `utils/ConfigManager.java` | `app/src/main/java/com/ridesmart/ai/utils/` |
| `network/LiveDataManager.java` | `app/src/main/java/com/ridesmart/ai/network/` ← CREAR carpeta |

### 1b. Reemplazar WebView assets

```bash
cp -r web/public/* android/app/src/main/assets/public/
```

### 1c. Verificar AndroidManifest.xml tiene:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### 1d. Compilar y instalar
```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## PASO 2 — BACKEND (10 min)

### 2a. Configurar API keys en .env

```bash
cp backend/.env.example backend/.env
```

Edita `backend/.env`:

```env
# REQUERIDAS — sin estas algunas funciones no cargan

# Google Maps — para zonas dinámicas y tráfico
# https://console.cloud.google.com → Enable Maps + Geocoding + Distance Matrix
GOOGLE_MAPS_API_KEY=AIza...

# OpenWeather — para clima y surge por lluvia
# https://openweathermap.org/api → FREE tier funciona
OPENWEATHER_API_KEY=...

# OPCIONALES — mejoran la app pero no la rompen si no están

# Ticketmaster — conciertos y eventos
# https://developer.ticketmaster.com → Discovery API, FREE
TICKETMASTER_API_KEY=...

# RapidAPI / AeroDataBox — vuelos en tiempo real
# https://rapidapi.com/aedbx-aedbx/api/aerodatabox
RAPIDAPI_KEY=...

# NREL — estaciones EV (usa DEMO_KEY gratis para pruebas)
NREL_API_KEY=DEMO_KEY

PORT=3000
```

### 2b. Deploy en Render.com (gratis)

1. Push el contenido de `backend/` a un repo GitHub
2. Render.com → New Web Service → conectar repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Agregar las ENV vars en el dashboard de Render
6. Copy tu URL: `https://tu-app.onrender.com`

### 2c. Actualizar la URL del backend en el Android

En `LiveDataManager.java` línea 30:
```java
private static final String API_BASE = "https://tu-app.onrender.com";
```

Y en todos los HTML (busca y reemplaza):
```
https://ride-smart-ai.onrender.com → https://tu-app.onrender.com
```

---

## PASO 3 — TELÉFONO (5 min)

1. Instalar el APK
2. **Configuración → Accesibilidad → Servicios instalados → Ride Smart AI → Activar**
3. **Configuración → Aplicaciones → Ride Smart → Permisos → Superposición → Permitir**
4. Abrir la app → **Filters** → configurar tus filtros → **Save**
5. Abrir Uber o Lyft → esperar una oferta

---

## LO QUE VERÁS

### Overlay encima de Lyft/Uber:
```
║ 🟣 GODLIKE  $12.86  $2.52/mi  $42/hr  7m·2.2mi  ⚡AUTO ║
║ 🟢 BUENA    $9.40   $1.57/mi  $28/hr  5m·1.8mi        ║
║ 🟡 REGULAR  $7.20   $1.12/mi  $22/hr  9m·3.1mi        ║
║ 🔴 MALA     $5.20   $0.74/mi  $17/hr  14m·5.2mi       ║
║ 🗑 BASURA   $3.80   $0.48/mi  $12/hr  18m·8.0mi       ║
```

### Logcat (filtrar RS4):
```
RS4_SERVICE: 📦 OFFER DETECTED
RS4_SERVICE: 💰 $12.86 | $/mi=2.52 | $/hr=42 | score=91 | GODLIKE
RS4_SERVICE: ⚡ AUTO-ACCEPT TRIGGERED
RS4_LIVE_DATA: 📡 Live data refreshed — lat=41.99 lng=-87.88
RS4_CONFIG: enableAI=true autoAccept=true minDpm=1.4
```

---

## API KEYS — PRIORIDAD

| API | Gratis | Impacto |
|---|---|---|
| OpenWeather | ✅ Sí, free tier | Surge por lluvia |
| Ticketmaster | ✅ Sí, free tier | Eventos y conciertos |
| Google Maps | ⚠️ $200 crédito/mes | Zonas dinámicas, tráfico |
| AeroDataBox | ⚠️ ~$10/mes | Vuelos en tiempo real |
| NREL | ✅ DEMO_KEY gratis | EV stations |

Sin APIs → la app funciona con datos estimados y sigue detectando órdenes.
Con APIs → los datos de zonas, eventos y aeropuertos son en tiempo real.

---

## CHANGELOG — CORRECCIONES v4.0.1

### ✅ Fix 1 — URL del backend centralizada
**Antes:** URL hardcodeada en 8 archivos distintos.
**Ahora:** Cambia en **un solo lugar**:

- **Web:** `web/public/config.js` → línea 1
- **Android:** `android/app/src/main/res/values/config.xml` → `rs4_api_base`

### ✅ Fix 2 — events.js no usa require()
`require()` causaba error en proyectos ES Module (`"type":"module"`).
Corregido a `import { haversineMi } from '../services/locationEngine.js'`.

### ✅ Fix 3 — flightService.js con datos reales
**Antes:** devolvía O'Hare y Midway con números fijos (mock).
**Ahora:** llama a AeroDataBox (RapidAPI) para cualquier aeropuerto IATA.
Sin API key → fallback inteligente basado en hora del día y día de semana.
Con API key → datos reales en tiempo real.

### ✅ Fix 4 — airports.html sin mock data
**Antes:** En error mostraba AA1234, UA5678, DL9012 (fake).
**Ahora:** Muestra error claro + badge "(est.)" cuando los datos son estimados.
Funciona dinámicamente con cualquier aeropuerto cercano al driver.

---

## PRIORIDAD DE API KEYS PARA HOY

Si solo puedes agregar una API key hoy, esta es el orden:

1. **OpenWeather** — gratis, impacto inmediato (surge por lluvia)
2. **Ticketmaster** — gratis, agrega eventos reales
3. **Google Maps** — $200 crédito/mes, zonas dinámicas reales
4. **RapidAPI/AeroDataBox** — ~$10/mes, vuelos reales en tiempo real
