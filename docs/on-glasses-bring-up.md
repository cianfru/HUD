# Getting a build onto the real G2 (macOS)

You do **not** upload anything or publish to a store. The app runs from a dev
server on your Mac; the glasses load it over your local Wi-Fi by scanning a QR
that points at your Mac's address. The Even SDK is a library compiled *into* the
app — nothing separate is installed on the glasses.

## One-time setup on the Mac (~30–45 min)

1. **Install Node.js LTS** from nodejs.org, and Git. Check in Terminal:
   `node -v` and `git -v` should both print a version.
2. **Install the Even Hub tooling** (global — gives the `evenhub` / `eh` CLI):
   ```bash
   npm install -g @evenrealities/evenhub-cli @evenrealities/evenhub-simulator
   ```
3. **Get the code** (the work is on the feature branch, not `main`):
   ```bash
   git clone https://github.com/cianfru/hud.git
   cd hud
   git checkout claude/aviation-hud-even-g2-phi44h
   npm install
   ```
3. **Enable Developer Mode**: sign in at https://hub.evenrealities.com/login with
   your Even account, then force-quit and reopen the Even app on your phone. A
   developer / **Scan QR** section appears in the Even Hub tab.
   (Menu labels move around between app versions — we confirm the exact taps live.)

## Networking — the one gotcha

Phone and Mac must be on the **same local network**. Hotel/airport/office Wi-Fi
usually has *client isolation* that blocks phone↔Mac.

**Travel fix:** turn on your phone's **Personal Hotspot** and connect the Mac to
it. Both devices are now on the phone's network with no isolation.

## Load a build (each time)

1. Start the dev server for the build you want. Start with the sim-reference deck:
   ```bash
   npm run dev:simref      # or: npm run dev:glasses  (the diversion HUD)
   ```
   Vite prints a **Network** URL like `http://192.168.x.x:5176` — note that IP:port.
2. In a second Terminal tab (leave the dev server running), make a QR at that URL:
   ```bash
   evenhub qr --url "http://192.168.x.x:5175"   # or: eh qr --url "..."
   ```
3. In the Even app → **Even Hub → Developer / Scan** → scan the QR off your
   Terminal. The app renders on the glasses.
4. Navigate with the temple touchpad (swipe / tap). The R1 ring comes later.

## First target, then next

- **First:** load `dev:simref` — it's useful to you (your sim cards) and it's
  already validated to render. Getting this on-glasses proves the whole pipeline
  and lets you judge **readability** in real light.
- **Next:** once loading works, we build the **IMU + latency probe** to measure
  real head-tracking rate and motion-to-photon lag — the numbers that decide how
  much head-referenced behaviour (look-to-declutter, look-lock) is worth building.

## One thing we confirm together at the machine

- The precise Developer-Mode / Scan menu path in your Even app version.
