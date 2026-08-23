# Changelog

All notable changes to the Even G2 Aviation HUD.

This is a **personal, supplemental, experimental** tool — not a certified
instrument, not part of the aircraft, and never a primary reference.

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
