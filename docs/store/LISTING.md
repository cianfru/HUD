# Store listing — Aviation HUD

Copy-paste text for the Even Hub developer portal. Screenshots for the listing
are the simulator captures in this folder (576×288 RGBA).

## Name
Aviation HUD

## Tagline
Offline flight awareness on your glasses

## Description
Aviation HUD is a personal, supplemental situational-awareness display for
airline pilots wearing Even Realities G2 glasses. It is not a navigation or
flight-planning tool and never replaces the aircraft's instruments.

Before departure, load your flight on the phone — drop the OFP PDF, paste its
text, or type departure, destination and alternate — and fetch the latest
weather. Everything is then stored on the phone, so in the air it works with no
internet connection.

On the glasses:
- CRUISE: ground speed only by default; hold to show track, GPS altitude, the
  closest suitable alternate airport and the destination's local arrival time.
- ALTERNATES: the four most suitable en-route airports with runway and
  VMC/IMC, plus each one's latest METAR, TAF and ATIS frequency.
- DESTINATION: arrival local time, runway, VMC/IMC, ATIS and weather.
- SETTINGS: clock, auto-sequence and text brightness.

GPS comes from your phone — for example a Garmin GLO paired to the iPhone.

## Privacy policy URL
https://github.com/cianfru/HUD/blob/main/PRIVACY.md

## Notes for the reviewer
- The app needs a flight to show live data. To review without one, open the
  phone panel and tap **Try the demo (simulated flight)**; every CRUISE screen
  is then tagged `DEMO - simulated flight`. **Clear flight / stop demo** returns
  to the first-run screen.
- First run with no flight shows setup instructions on the glasses.
- Exit: double-tap on the CRUISE page (the root page) opens the system exit
  confirmation (`shutDownPageContainer(1)`).
- Gestures: swipe = change page; on CRUISE hold = show the full strip, tap = keep
  it shown; on ALTERNATES double-tap opens the weather, swipe steps through
  airports, double-tap goes back.
- Network: only `g2-hud-wx-cianfrus-projects.vercel.app` (whitelisted), for
  public METAR/TAF by airport code. Location is used on the device only.

## Changelog (v0.6.0)
Resubmission addressing the review findings: removed the third-party PDF
library (no unlisted URLs, no dynamic code); double-tap on the root page now
opens the system exit confirmation; first run shows setup instructions on the
glasses; the demo is opt-in and labelled; screenshots captured from the
simulator.
