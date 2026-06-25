"""
Compute subway (BART-equivalent transit) proximity scores for uni-hood NYC
neighborhoods.

ORIGINAL bayborhood (SF) methodology, from "Neighborhood Manipulation.ipynb"
(driving_bart_score / walking_bart_score cells):

  1. For each neighborhood centroid, call the Bing Maps Routes API to get the
     travelDuration (seconds) to each of 9 hardcoded SF BART stations, by
     "Driving" and by "Walking" separately, and take the MINIMUM duration
     over all stations (i.e. time to the nearest station).
  2. Score via FIXED time thresholds (not quartiles -- this is a difference
     from the grocery/gym scoring, which IS percentile-based):
       duration >  15 min -> score 3 (best)
       duration >  10 min -> score 2
       duration >   5 min -> score 1
       duration <=  5 min -> score 0 (worst)
     This is INVERTED ("farther/slower commute = better score"), the same
     backwards convention bayborhood uses for groceries/gyms. Carried
     forward here verbatim for full feature parity.

NYC adaptation: Bing Maps Routes API is not available in this environment,
so travel time is approximated from straight-line (haversine) distance to
the nearest subway station/complex, converted to an equivalent walking time
using a standard urban pedestrian speed of 1.4 m/s (~5 km/h, the figure used
by Walk Score and most urban-planning literature). This produces a single
"subway_score" (no separate driving/walking variant, since NYC residents
overwhelmingly access the subway on foot and we don't have road-network
data to model driving time anyway).

  walking_speed = 1.4 m/s
  5 min threshold  ->  420 m
  10 min threshold ->  840 m
  15 min threshold -> 1260 m

  distance >  1260 m -> score 3 (best)
  distance >   840 m -> score 2
  distance >   420 m -> score 1
  distance <=  420 m -> score 0 (worst)

Subway stations: NYC MTA Subway Stations dataset (data.ny.gov resource
39hk-dx4f), deduplicated by complex_id (a "complex" groups multiple
line/division rows at the same physical station hub) -- see
raw/subway_stations.json, derived from raw/subway_batch1-5.json.
"""
import json
import math
import os
from collections import Counter

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")
GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "neighborhoods.geojson")

WALKING_SPEED_MPS = 1.4  # ~5 km/h, standard pedestrian speed assumption

THRESH_5MIN = 5 * 60 * WALKING_SPEED_MPS    # 420 m
THRESH_10MIN = 10 * 60 * WALKING_SPEED_MPS  # 840 m
THRESH_15MIN = 15 * 60 * WALKING_SPEED_MPS  # 1260 m


def haversine_meters(lon1, lat1, lon2, lat2):
    R = 6371008.8  # mean Earth radius, meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def score_from_distance(d):
    if d > THRESH_15MIN:
        return 3
    elif d > THRESH_10MIN:
        return 2
    elif d > THRESH_5MIN:
        return 1
    else:
        return 0


def main():
    with open(os.path.join(DATA_DIR, "subway_stations.json")) as f:
        stations = json.load(f)

    with open(GEOJSON_PATH) as f:
        geo = json.load(f)
    feats = geo["features"]
    print(f"Loaded {len(feats)} neighborhood features, {len(stations)} subway station complexes.")

    for feat in feats:
        props = feat["properties"]
        nlon, nlat = props["centroid_lon"], props["centroid_lat"]
        min_dist = min(
            haversine_meters(nlon, nlat, s["longitude"], s["latitude"]) for s in stations
        )
        props["distance_from_subway"] = round(min_dist, 1)
        props["subway_score"] = score_from_distance(min_dist)

    with open(GEOJSON_PATH, "w") as f:
        json.dump(geo, f)

    print("subway_score distribution:", dict(Counter(f["properties"]["subway_score"] for f in feats)))
    print(f"thresholds (m): 5min<= {THRESH_5MIN:.0f}, 10min<= {THRESH_10MIN:.0f}, 15min<= {THRESH_15MIN:.0f}")

    by_dist = sorted(feats, key=lambda f: f["properties"]["distance_from_subway"])
    print("Closest 3 to a subway station:")
    for f in by_dist[:3]:
        print(" ", f["properties"]["name"], f["properties"]["distance_from_subway"], f["properties"]["subway_score"])
    print("Farthest 3 from a subway station:")
    for f in by_dist[-3:]:
        print(" ", f["properties"]["name"], f["properties"]["distance_from_subway"], f["properties"]["subway_score"])


if __name__ == "__main__":
    main()
