/**
 * Bundled demo briefing pack — a real Doha→Shannon ETOPS-style airport set with
 * runway data (OurAirports) and cached TAFs (NOAA), captured on the ground so
 * the sim/glasses build flies the offline product with NO network.
 *
 * This is a FROZEN snapshot for the demo. Its TAFs are only valid for ~24-30 h
 * from createdAt, so the demo drives the controller clock from createdAt (see
 * src/glasses/main.ts) to keep suitability inside the forecast window. For a
 * real flight, build a fresh pack: node scripts/build-briefing.mjs <idents...>
 *
 * Generated from briefing/OTHH-EINN.json — do not hand-edit; rebuild instead.
 */
import type { BriefingPack } from "./briefing.js";

export const DEMO_BRIEFING: BriefingPack = {
  "version": 1,
  "createdAt": "2026-08-06T06:03:15.404Z",
  "route": "OTHH OMDB OOMS OEJN HECA LGAV LIRF EGLL BIKF EINN",
  "airports": [
    {
      "ident": "BIKF",
      "name": "Keflavik International Airport",
      "lat": 63.985,
      "lon": -22.6056,
      "elevFt": 171,
      "longestRwyFt": 10056,
      "hardSurface": true
    },
    {
      "ident": "EGLL",
      "name": "London Heathrow Airport",
      "lat": 51.4707,
      "lon": -0.4599,
      "elevFt": 83,
      "longestRwyFt": 12799,
      "hardSurface": true
    },
    {
      "ident": "EINN",
      "name": "Shannon Airport",
      "lat": 52.702,
      "lon": -8.9248,
      "elevFt": 46,
      "longestRwyFt": 10495,
      "hardSurface": true
    },
    {
      "ident": "HECA",
      "name": "Cairo International Airport",
      "lat": 30.1115,
      "lon": 31.3967,
      "elevFt": 322,
      "longestRwyFt": 13124,
      "hardSurface": true
    },
    {
      "ident": "LGAV",
      "name": "Athens Eleftherios Venizelos International Airport",
      "lat": 37.9364,
      "lon": 23.9445,
      "elevFt": 308,
      "longestRwyFt": 13123,
      "hardSurface": true
    },
    {
      "ident": "LIRF",
      "name": "Rome–Fiumicino Leonardo da Vinci International Airport",
      "lat": 41.8045,
      "lon": 12.252,
      "elevFt": 13,
      "longestRwyFt": 12801,
      "hardSurface": true
    },
    {
      "ident": "OEJN",
      "name": "King Abdulaziz International Airport",
      "lat": 21.6802,
      "lon": 39.1574,
      "elevFt": 48,
      "longestRwyFt": 13123,
      "hardSurface": true
    },
    {
      "ident": "OMDB",
      "name": "Dubai International Airport",
      "lat": 25.2498,
      "lon": 55.371,
      "elevFt": 62,
      "longestRwyFt": 14590,
      "hardSurface": true
    },
    {
      "ident": "OOMS",
      "name": "Muscat International Airport",
      "lat": 23.6002,
      "lon": 58.2853,
      "elevFt": 48,
      "longestRwyFt": 13386,
      "hardSurface": true
    },
    {
      "ident": "OTHH",
      "name": "Hamad International Airport",
      "lat": 25.2731,
      "lon": 51.6081,
      "elevFt": 13,
      "longestRwyFt": 15912,
      "hardSurface": true
    }
  ],
  "weather": [
    {
      "ident": "BIKF",
      "metarRaw": "METAR BIKF 060530Z 17009KT 3000 -RA BR BKN003 OVC050 11/11 Q1005",
      "metarObsSec": 1785994200,
      "tafRaw": "TAF BIKF 060434Z 0606/0706 16010KT 8000 -RA BKN010 OVC016 TX12/0615Z TN10/0706Z TEMPO 0606/0706 2500 RADZ BR BKN004 OVC008 BECMG 0618/0620 09008KT"
    },
    {
      "ident": "EGLL",
      "metarRaw": "METAR EGLL 060520Z AUTO 27009KT 9999 NCD 13/10 Q1021",
      "metarObsSec": 1785993600,
      "tafRaw": "TAF EGLL 060454Z 0606/0712 28010KT 9999 FEW045 BECMG 0618/0621 34005KT"
    },
    {
      "ident": "EINN",
      "metarRaw": "METAR EINN 060530Z 24006KT 9999 FEW014 BKN050 13/10 Q1023 NOSIG",
      "metarObsSec": 1785994200,
      "tafRaw": "TAF EINN 060500Z 0606/0706 26007KT 9999 SCT030 BKN045 BECMG 0620/0622 22007KT"
    },
    {
      "ident": "HECA",
      "metarRaw": "METAR HECA 060530Z 32004KT CAVOK 26/20 Q1010 NOSIG",
      "metarObsSec": 1785994200,
      "tafRaw": "TAF HECA 060500Z 0606/0712 34008KT CAVOK TEMPO 0617/0620 36015KT"
    },
    {
      "ident": "LGAV",
      "metarRaw": "METAR LGAV 060520Z 05012KT CAVOK 27/18 Q1011 NOSIG",
      "metarObsSec": 1785993600,
      "tafRaw": "TAF LGAV 060500Z 0606/0706 02018G28KT 9999 FEW025 BECMG 0618/0620 35014KT"
    },
    {
      "ident": "LIRF",
      "metarRaw": "METAR LIRF 060520Z 02003KT 350V050 CAVOK 24/17 Q1014 NOSIG",
      "metarObsSec": 1785993600,
      "tafRaw": "TAF LIRF 060500Z 0606/0712 VRB05KT CAVOK BECMG 0609/0611 28013KT BECMG 0621/0623 34010KT BECMG 0702/0704 VRB05KT TEMPO 0702/0706 1500 BCFG BKN010 BECMG 0709/0711 26010KT"
    },
    {
      "ident": "OEJN",
      "metarRaw": "METAR OEJN 060500Z 34008KT CAVOK 34/25 Q1002 NOSIG",
      "metarObsSec": 1785992400,
      "tafRaw": "TAF OEJN 060500Z 0606/0712 30018KT 7000 FEW040 PROB30 TEMPO 0609/0615 3000 BLDU BECMG 0618/0620 35010KT BECMG 0708/0710 30016KT"
    },
    {
      "ident": "OMDB",
      "metarRaw": "METAR OMDB 060530Z 18006KT 8000 NSC 40/19 Q0998 NOSIG",
      "metarObsSec": 1785994200,
      "tafRaw": "TAF OMDB 060500Z 0606/0712 20008KT CAVOK BECMG 0607/0609 33013KT BECMG 0616/0618 VRB02KT BECMG 0703/0705 17010KT BECMG 0708/0710 32013KT"
    },
    {
      "ident": "OOMS",
      "metarRaw": "METAR OOMS 060450Z 04005KT CAVOK 37/25 Q0998 NOSIG",
      "metarObsSec": 1785991800,
      "tafRaw": "TAF OOMS 052300Z 0600/0706 VRB02KT 8000 NSC PROB30 TEMPO 0600/0602 21015KT BECMG 0606/0608 06012KT BECMG 0615/0617 VRB02KT PROB30 TEMPO 0618/0702 20018KT 5000 DRDU BECMG 0704/0706 02010KT"
    },
    {
      "ident": "OTHH",
      "metarRaw": "METAR OTHH 060500Z 21005KT 180V250 8000 NSC 37/25 Q0998 NOSIG",
      "metarObsSec": 1785992400
    }
  ]
};
