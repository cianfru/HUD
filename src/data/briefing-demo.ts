/**
 * Bundled demo briefing pack — a real Doha->Shannon ETOPS-style airport set with
 * runway data + headings (OurAirports) and cached TAFs (NOAA), captured on the
 * ground so the sim/glasses build flies the offline product with NO network.
 *
 * FROZEN snapshot for the demo. Its TAFs are only valid ~24-30 h from createdAt,
 * so the demo drives the controller clock from createdAt (see glasses/main.ts).
 * For a real flight, build a fresh pack: node scripts/build-briefing.mjs <idents>
 *
 * Generated from a build-briefing run — do not hand-edit; rebuild instead.
 */
import type { BriefingPack } from "./briefing.js";

export const DEMO_BRIEFING: BriefingPack = {
  "version": 1,
  "createdAt": "2026-08-18T17:16:39.378Z",
  "route": "OTHH OMDB OOMS OEJN HECA LGAV LIRF EGLL BIKF EINN",
  "airports": [
    {
      "ident": "BIKF",
      "name": "Keflavik International Airport",
      "lat": 63.985,
      "lon": -22.6056,
      "elevFt": 171,
      "longestRwyFt": 10056,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        14,
        104,
        194,
        284
      ]
    },
    {
      "ident": "EGLL",
      "name": "London Heathrow Airport",
      "lat": 51.4707,
      "lon": -0.4599,
      "elevFt": 83,
      "longestRwyFt": 12799,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        90,
        270
      ]
    },
    {
      "ident": "EINN",
      "name": "Shannon Airport",
      "lat": 52.702,
      "lon": -8.9248,
      "elevFt": 46,
      "longestRwyFt": 10495,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        52,
        232
      ]
    },
    {
      "ident": "HECA",
      "name": "Cairo International Airport",
      "lat": 30.1115,
      "lon": 31.3967,
      "elevFt": 322,
      "longestRwyFt": 13124,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        45,
        49,
        225,
        229
      ]
    },
    {
      "ident": "LGAV",
      "name": "Athens Eleftherios Venizelos International Airport",
      "lat": 37.9364,
      "lon": 23.9445,
      "elevFt": 308,
      "longestRwyFt": 13123,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        37,
        217
      ]
    },
    {
      "ident": "LIRF",
      "name": "Rome–Fiumicino Leonardo da Vinci International Airport",
      "lat": 41.8045,
      "lon": 12.252,
      "elevFt": 13,
      "longestRwyFt": 12801,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        70,
        163,
        250,
        343
      ]
    },
    {
      "ident": "OEJN",
      "name": "King Abdulaziz International Airport",
      "lat": 21.6802,
      "lon": 39.1574,
      "elevFt": 48,
      "longestRwyFt": 13123,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        160,
        340
      ]
    },
    {
      "ident": "OMDB",
      "name": "Dubai International Airport",
      "lat": 25.2498,
      "lon": 55.371,
      "elevFt": 62,
      "longestRwyFt": 14590,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        121,
        301
      ]
    },
    {
      "ident": "OOMS",
      "name": "Muscat International Airport",
      "lat": 23.6002,
      "lon": 58.2853,
      "elevFt": 48,
      "longestRwyFt": 13386,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        85,
        265
      ]
    },
    {
      "ident": "OTHH",
      "name": "Hamad International Airport",
      "lat": 25.2731,
      "lon": 51.6081,
      "elevFt": 13,
      "longestRwyFt": 15912,
      "hardSurface": true,
      "runwayHeadingsDeg": [
        156,
        336
      ]
    }
  ],
  "weather": [
    {
      "ident": "BIKF",
      "metarRaw": "METAR BIKF 181700Z 28009KT 250V310 9999 FEW007 SCT035 13/09 Q1013",
      "metarObsSec": 1787072400,
      "tafRaw": "TAF BIKF 181638Z 1818/1918 30008KT 9999 SCT030 BKN045 TX13/1915Z TN07/1902Z TEMPO 1900/1918 SCT008 BKN014"
    },
    {
      "ident": "EGLL",
      "metarRaw": "METAR EGLL 181650Z AUTO 26014KT 9999 NCD 24/14 Q1009",
      "metarObsSec": 1787071800,
      "tafRaw": "TAF EGLL 181658Z 1818/1924 28012KT 9999 SCT035 PROB30 TEMPO 1821/1901 9000 -RA TEMPO 1901/1909 8000 -RA BKN012 PROB40 TEMPO 1903/1908 4000 SHRA RADZ BKN008 PROB30 TEMPO 1909/1913 8000 -SHRA TEMPO 1913/1920 7000 SHRA PROB30 TEMPO 1915/1920 27015G25KT 4000 +SHRA"
    },
    {
      "ident": "EINN",
      "metarRaw": "METAR EINN 181700Z 26008KT 9999 FEW015 SCT030 BKN039 17/13 Q1012 NOSIG",
      "metarObsSec": 1787072400,
      "tafRaw": "TAF EINN 181700Z 1818/1918 25012KT 9999 FEW015 BKN035 TEMPO 1818/1902 22009KT 7000 -RA BKN010 PROB40 TEMPO 1818/1902 3000 RADZ BR BKN006 PROB30 TEMPO 1822/1902 24015G25KT PROB40 TEMPO 1905/1918 27015G27KT 4000 SHRA BKN012"
    },
    {
      "ident": "HECA",
      "metarRaw": "METAR HECA 181700Z 36011KT CAVOK 31/15 Q1009 NOSIG",
      "metarObsSec": 1787072400,
      "tafRaw": "TAF HECA 181700Z 1818/1924 02010KT 9999 FEW025 TEMPO 1901/1909 VRB03KT 4000 HZ PROB30 TEMPO 1902/1906 2000 BR"
    },
    {
      "ident": "LGAV",
      "metarRaw": "METAR LGAV 181650Z 22008KT 9999 FEW025 27/18 Q1009 NOSIG",
      "metarObsSec": 1787071800,
      "tafRaw": "TAF LGAV 181700Z 1818/1918 VRB03KT 9999 FEW025 TEMPO 1909/1915 10010KT SCT020 SCT070"
    },
    {
      "ident": "LIRF",
      "metarRaw": "METAR LIRF 181650Z 27007KT CAVOK 29/22 Q1010 NOSIG",
      "metarObsSec": 1787071800,
      "tafRaw": "TAF LIRF 181100Z 1812/1918 23010KT CAVOK BECMG 1816/1818 29010KT BECMG 1820/1822 VRB05KT BECMG 1909/1911 24012KT"
    },
    {
      "ident": "OEJN",
      "metarRaw": "METAR OEJN 181700Z 34011KT 9999 FEW040 34/20 Q1005 NOSIG",
      "metarObsSec": 1787072400,
      "tafRaw": "TAF OEJN 181100Z 1812/1918 32014KT 9999 FEW040 BECMG 1818/1820 02006KT CAVOK BECMG 1908/1910 32014KT"
    },
    {
      "ident": "OMDB",
      "metarRaw": "METAR OMDB 181700Z 05007KT 030V090 CAVOK 40/22 Q0998 NOSIG",
      "metarObsSec": 1787072400,
      "tafRaw": "TAF OMDB 181700Z 1818/2000 06005KT 8000 NSC BECMG 1903/1905 18010KT BECMG 1908/1910 33012KT BECMG 1916/1918 VRB02KT"
    },
    {
      "ident": "OOMS",
      "metarRaw": "METAR OOMS 181650Z 02003KT 7000 30/29 Q1000 NOSIG",
      "metarObsSec": 1787071800,
      "tafRaw": "TAF OOMS 181700Z 1818/1924 VRB02KT 8000 NSC TEMPO 1823/1904 4000 BR BKN020 BECMG 1907/1909 05010KT CAVOK BECMG 1915/1917 VRB02KT 8000"
    },
    {
      "ident": "OTHH",
      "metarRaw": "METAR OTHH 181700Z 04006KT 8000 NSC 35/30 Q0999 NOSIG",
      "metarObsSec": 1787072400,
      "tafRaw": "TAF OTHH 181117Z 1812/1918 04008KT 8000 NSC TEMPO 1818/1906 33006KT"
    }
  ]
};
