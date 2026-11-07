# Aviation HUD — Privacy Policy

_Last updated: 7 November 2026_

Aviation HUD is a supplemental heads-up display for Even Realities G2 glasses.
It is designed to work offline and to keep your data on your phone.

## Permissions and what they are used for

### Location
The app reads your phone's location (for example from a Garmin GLO paired to
the iPhone) to show ground speed, track and GPS altitude, and to compute the
bearing and distance to diversion airports and your estimated arrival time.

- Location is processed **only on your device**.
- It is **never sent** to any server, **never stored** by the app, and **never
  shared** with anyone.

### Network
The app makes one kind of network request: fetching public aviation weather
(METAR and TAF reports) for your flight's airports, when you type a route or
press **Fetch latest weather** before departure.

- The request goes to the app's weather proxy at
  `g2-hud-wx-cianfrus-projects.vercel.app`, which retrieves the reports from the
  U.S. NOAA Aviation Weather Center.
- The request contains **only ICAO airport identifiers** (e.g. `OTHH,UZTT`). It
  contains no location, no flight plan contents and nothing that identifies you.
- The hosting provider (Vercel) may keep standard server logs such as IP address
  and time of request, under its own privacy policy.

## Flight plans (OFP)
When you load an OFP PDF or paste its text, it is read **entirely on your
phone** and is never uploaded. The app keeps only the derived briefing — airport
identifiers, positions, runways and weather — in the app's local storage on your
phone. **Clear flight** deletes it.

## What the app does not do
No accounts, no analytics, no advertising, no tracking, and no sale or sharing
of any data.

## Safety notice
Aviation HUD is a personal, supplemental situational-awareness tool. It is not a
certified instrument and must never be used as a primary reference for
navigation or flight decisions.

## Contact
Questions about this policy: [your contact email]
