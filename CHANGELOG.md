# Changelog

All notable changes to the Even G2 Aviation HUD.

This is a **personal, supplemental, experimental** tool — not a certified
instrument, not part of the aircraft, and never a primary reference.

## v0.5.0 — 2026-09-03

### Added
- **ATIS frequencies** on the airport pages. Each alternate's weather browser
  and the DEST page now show the field's ATIS frequency (e.g. `ATIS 128.85`)
  alongside the METAR/TAF, verdict, runway and V/I — bundled offline from
  OurAirports (1,409 fields carry one).
- **Exact arrival local time** via per-airport IANA time zones (bundled for all
  4,981 fields) computed DST-correct with `Intl`. Replaces the longitude
  estimate, so the destination arrival LT is right year-round (Tashkent +5,
  etc.). Longitude remains a last-resort fallback.
- **Text brightness setting** (SETTINGS → `Bright`, levels 1–4, SDK `textColor`).
  Dim the HUD to cut distraction and save a little power; changing it rebuilds
  the page so the new brightness applies immediately.
- **Runway-in-use now carries L/R/C.** Instead of just a runway number, the
  wind-derived runway shows its real designator; for a parallel pair the wind
  can't distinguish, it shows the group (e.g. `26L/R`) — the actual side is an
  ATIS call, whose frequency is now on the page.

### Changed
- Airport database rebuilt with runway designators, time zones and ATIS
  frequencies (schema updated; legacy-code aliases retained). SDK bumped to
  0.0.14 for `textColor`.

## v0.4.1 — 2026-09-03

### Fixed — arrival time now uses the OFP's routed distance
- Estimated landing time was computed from the great-circle dep→dest distance,
  which badly underestimates when the real routing detours (e.g. Tashkent→Doha
  routing around Iran via Afghanistan). The OFP's planned **`GND DIST`** (ground
  distance, with `AIR DIST` as fallback) is now read and used to scale the ETA
  off the actual routed distance. On the OTHH→UZTT OFP: great-circle 1302 NM vs
  planned 1883 NM — the ETA was ~1.2 h optimistic and is now correct.
- Typed dep/dest routes (no OFP) still use the straight-line estimate, since no
  planned distance is available.

## v0.4.0 — 2026-08-31

### Added — hold-to-reveal declutter (CRUISE)
- CRUISE is now **minimal by default** (ground speed only), so nothing sits in
  your central vision unless you ask for it. Uses the firmware's long-press:
  - **Hold** (tap-then-long-press) reveals the full strip — track, GPS alt,
    closest alternate, destination arrival LT — **while held**;
  - **release** returns to the minimal strip;
  - **tap** latches the full strip on (tap again to turn it off).
  - The full strip is auto-suppressed in a critical phase (low/slow); a
    momentary hold still peeks past it.
- Long-press events (`LONG_PRESS_EVENT` / `LONG_PRESS_RELEASE_EVENT`, codes
  9/10) are now decoded from the touch bridge.

### Notes on screen-off operation
- Reviewed the Even background-lifecycle docs: on iOS the WebView keeps running
  when backgrounded, but **`startAppLocationUpdates` stops when the WebView is
  suspended**, and there is **no background-location mode**. So continuous GPS
  with the phone screen off is **not possible with the current SDK** — the
  screen wake lock (v0.3.3) remains the correct approach. Recommended in-cockpit
  setup: phone on ship's power, screen brightness at minimum, face-down.

## v0.3.3 — 2026-08-31

### Fixed — GPS reliability (from the first in-aircraft trial)
- **Screen wake lock**: the HUD froze at altitude when the phone screen slept
  (iOS suspends the WebView and its location feed). The app now holds a screen
  wake lock and re-acquires it when it returns to the foreground, so the display
  and the GLO feed keep running.
- **Self-healing GLO feed**: the location subscription is now watched — if fixes
  stop arriving (BLE hiccup, backgrounding, momentary GPS loss) it re-subscribes
  and re-arms location updates automatically, instead of freezing on the last
  fix until the app is restarted.
- **Rebuild on reconnect**: a dropped-then-restored BLE link to the glasses now
  forces a full page rebuild, so the display comes back instead of pushing
  updates to containers that no longer exist.
- **GPS-stale indicator**: when there's a last fix but nothing recent, CRUISE
  shows `GS --- GPS?` and `GPS STALE - reconnecting` rather than a frozen ground
  speed, so a dropped feed reads as dropped, not as valid data.
- **Guarded render loop**: one bad frame can no longer wedge the periodic
  redraw.

### Changed
- **Arrival local time for any destination**: when a field isn't in the curated
  time-zone table, the DEST/CRUISE arrival LT is now estimated from longitude
  (whole hours) instead of showing blank. This ignores DST and political
  time-zone boundaries, so it can be an hour off in DST-observing regions —
  a proper per-airport time zone is a follow-up.

## v0.3.2 — 2026-08-30

### Fixed
- **Destination airport missing after loading an OFP** (e.g. Doha → Tashkent).
  Two causes: (1) the bundled airport database keyed fields by their current
  ICAO code but joined runway data on OurAirports' legacy ident, so reassigned
  codes (Uzbekistan's UTTT is now **UZTT**) lost their runways and were dropped
  entirely; (2) fields with no runway data were discarded even as destinations.
  The database is rebuilt so every large/medium field is kept (a runway-less
  field still resolves as a destination position), stored under its **current
  ICAO code** (matching the OFP), with **legacy-code aliases** (typing UTTT
  still finds UZTT). Tashkent, Samarkand and 50-odd other reassigned fields now
  resolve. Database: 4,981 airports + 55 aliases.

## v0.3.1 — 2026-08-30

### Fixed
- **OFP PDF upload failed on the installed app** ("Setting up fake worker
  failed. text/plain is not a valid JavaScript MIME type"). A packaged `.ehpk`
  is served by the Even WebView's own file server, which returns the pdf.js
  worker `.mjs` as `text/plain`, so pdf.js refused to start it. The worker is now
  **inlined as a Blob-backed module worker** — no separate file, no MIME
  dependency — so the "drop the OFP PDF" flow works offline from the installed
  app, not just over the dev server.

## v0.3.0 — 2026-08-23

First build packaged for standalone install (`.ehpk`) rather than QR dev-serve.
The theme of this release: **tell it where you're going, freeze the weather on
the ground, read it offline in the air.**

### Flight setup (offline-first)
- **Set a flight three ways**: drop the OFP PDF (read in the phone WebView, no
  connection needed), paste the OFP text, or just type `DEP / DEST / ALTN`.
- Typed routes auto-add **en-route alternates** from the route corridor, built
  from a bundled 4,783-airport database (runways, elevations, positions) — so
  packs assemble on-device with no navdata fetch.
- **"Fetch latest weather (before departure)"** button: pulls fresh METAR/TAF
  for every field in the flight and **freezes it into the pack**. On the ground
  with a connection you press it once; in the air, offline, you read it.

### CRUISE page — glanceable, out of your way
- Stripped to a top band so the centre of view stays clear.
- Shows **GS · TRK · GPSALT**, the **closest usable en-route alternate**
  (runway in use + VMC/IMC), and **destination arrival in LOCAL time** (for the
  pax PA).
- Dropped the UTC clock and next-waypoint (already on the ND).
- **Critical-phase declutter**: parked, taxiing, take-off, approach and landing
  show **GS only**; the full strip returns only in established cruise (high and
  moving). Hysteresis prevents GPS-noise flicker.

### ALTERNATES (DIVERT) page — the offline diversion picture
- The **4 most suitable** A320-capable en-route alternates, ranked
  suitable-then-nearest, each judged from its cached TAF at the current time.
- Per field: **track-relative bearing, distance, likely runway in use, and
  VMC/IMC (V/I)**.
- **Weather browser**: open any alternate for its **raw METAR + TAF** and the
  go/no-go verdict — the actual observation/forecast, not just OK/not-OK.

### DEST page (replaces ROUTE)
- The old ROUTE list (which only mirrored the ND) is gone. The **DEST page**
  shows the destination's **arrival local time, likely runway, VMC/IMC, go/no-go
  verdict, and raw METAR/TAF** — so destination weather is readable in the cruise.

### Navigation — pages with leaves
- Four pages in swipe order: **CRUISE → ALTERNATES → DEST → SETTINGS**.
- Structured, predictable movement instead of one long scroll: swipe moves
  between pages; two taps open a page's detail; swipe browses within it; two
  taps step back.
- **SETTINGS** (Clock UTC/LT, Auto-sequence) uses the same enter → select →
  back model, with an explicit `< Back` row.
- Built only on the gestures the current firmware relays reliably (**swipe +
  double-tap**). Single-tap is treated the same as double-tap, so it will "just
  work" if a firmware update starts delivering it. (A future long-press for menu
  entry has a wire-up point reserved in the code.)

### Under the hood
- Weather proxy moved to a **CORS-enabled endpoint** so the phone WebView can
  actually read METAR/TAF responses (the previous endpoint silently blocked
  them).
- Packaged as an installable **`.ehpk`** (`com.cianfru.avhud`,
  `min_app_version 2.2.9`) for persistent install via the developer portal.
- 105 unit tests over the nav math, TAF/suitability engine, OFP parser and views.

### Known limits
- Weather **fetch** needs a ground connection; everything else is offline.
- Arrival **local time** shows only for destinations in the bundled UTC-offset
  table (others fall back to Zulu).
- **No NOTAMs** — runway suitability is from dimensions/surface + wind-derived
  runway-in-use, not field notices.
- The G2 cannot render a world-anchored / conformal horizon (hardware limit);
  this is a glanceable data HUD, not an attitude reference.
