/**
 * Bundled demo briefing pack — a real Doha->Shannon ETOPS-style airport set with
 * runway data + headings (OurAirports) and cached TAFs (NOAA), captured on the
 * ground so the sim/glasses build flies the offline product with NO network.
 *
 * FROZEN snapshot for the demo; regenerate with build-briefing to refresh. For a
 * real flight, build a fresh pack pre-flight so its TAFs are in their window.
 */
import type { BriefingPack } from "./briefing.js";

export const DEMO_BRIEFING: BriefingPack = {
  "version": 1,
  "createdAt": "2026-08-23T05:52:03.302Z",
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
      "metarRaw": "METAR BIKF 230530Z 20013KT 9999 BKN016 10/09 Q1002",
      "metarObsSec": 1787463000,
      "tafRaw": "TAF BIKF 230436Z 2306/2406 20018KT 9999 BKN012 TX12/2314Z TN07/2402Z BECMG 2307/2309 22008KT SCT026 BECMG 2404/2406 03010KT"
    },
    {
      "ident": "EGLL",
      "metarRaw": "METAR EGLL 230520Z AUTO VRB01KT 9999 NCD 12/09 Q1025",
      "metarObsSec": 1787462400,
      "tafRaw": "TAF EGLL 230456Z 2306/2412 06006KT CAVOK TEMPO 2320/2324 BKN035"
    },
    {
      "ident": "EINN",
      "metarRaw": "METAR EINN 230530Z VRB03KT 9999 FEW015 BKN049 12/10 Q1027 NOSIG",
      "metarObsSec": 1787463000,
      "tafRaw": "TAF EINN 230500Z 2306/2406 VRB03KT 9999 FEW015 BKN045"
    },
    {
      "ident": "HECA",
      "metarRaw": "METAR HECA 230530Z 02007KT 9999 SCT025 25/19 Q1011 NOSIG",
      "metarObsSec": 1787463000,
      "tafRaw": "TAF HECA 230500Z 2306/2412 01009KT CAVOK"
    },
    {
      "ident": "LGAV",
      "metarRaw": "METAR LGAV 230520Z VRB01KT CAVOK 26/17 Q1013 NOSIG",
      "metarObsSec": 1787462400,
      "tafRaw": "TAF LGAV 230500Z 2306/2406 04012KT 9999 FEW020"
    },
    {
      "ident": "LIRF",
      "metarRaw": "METAR LIRF 230520Z 05004KT CAVOK 22/19 Q1016 NOSIG",
      "metarObsSec": 1787462400,
      "tafRaw": "TAF LIRF 230500Z 2306/2412 VRB05KT CAVOK BECMG 2308/2310 28010KT BECMG 2318/2320 VRB05KT"
    },
    {
      "ident": "OEJN",
      "metarRaw": "METAR OEJN 230500Z 36004KT 9999 SCT040 33/24 Q1008 NOSIG",
      "metarObsSec": 1787461200,
      "tafRaw": "TAF OEJN 230500Z 2306/2412 30013KT 9999 FEW040 BECMG 2318/2320 36005KT 7000 SCT040 BECMG 2406/2408 32015KT 9999 FEW040"
    },
    {
      "ident": "OMDB",
      "metarRaw": "METAR OMDB 230530Z 07005KT 010V120 CAVOK 40/16 Q1002 NOSIG",
      "metarObsSec": 1787463000,
      "tafRaw": "TAF OMDB 230500Z 2306/2412 07005KT 8000 NSC BECMG 2307/2309 34010KT BECMG 2318/2320 11007KT BECMG 2407/2409 34013KT"
    },
    {
      "ident": "OOMS",
      "metarRaw": "METAR OOMS 230450Z 02006KT 8000 NSC 37/25 Q1002 NOSIG",
      "metarObsSec": 1787460600,
      "tafRaw": "TAF OOMS 230500Z 2306/2412 05014KT CAVOK BECMG 2315/2317 VRB02KT BECMG 2406/2408 04014KT"
    },
    {
      "ident": "OTHH",
      "metarRaw": "METAR OTHH 230500Z 01005KT 6000 NSC 35/29 Q1002 NOSIG",
      "metarObsSec": 1787461200
    }
  ]
};
