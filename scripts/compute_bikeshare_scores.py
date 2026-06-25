"""
Compute bikeshare (Citi Bike, the Bay Wheels-equivalent) proximity scores
for uni-hood NYC neighborhoods.

Mirrors the original bayborhood (SF) "bike_score" methodology from
"Neighborhood Manipulation.ipynb":
  1. For each neighborhood centroid, find the geodesic distance to the
     NEAREST bikeshare station (minimum over all stations).
  2. Sort neighborhoods by that distance ascending; split into 4 buckets
     using floor(n/4) index cutoffs -- same rank-based quartile mechanism
     used for park_score.
  3. Score is INVERTED relative to park_score: closest quartile -> 0
     (worst), farthest quartile -> 3 (best). This is the same "backwards"
     convention bayborhood uses for groceries/gym/BART. Carried forward
     here verbatim for full feature parity.

Citi Bike stations: sourced from Lyft's official GBFS feed
(gbfs.lyft.com/gbfs/.../bkn/en/station_information.json, system_id
"lyft_nyc"), which is the live, authoritative station inventory --
the direct NYC analog of the Bay Wheels GBFS feed bayborhood used for SF.

IMPORTANT LIMITATION (sandbox constraint, documented transparently):
Citi Bike's full system has ~2,800 active stations, but this sandbox's
fetch tool truncates any single HTTP response at roughly 65-70K
characters. GBFS has no server-side pagination/filtering, unlike the
Socrata APIs used for subway/grocery data, so the full station list
cannot be retrieved in one or even a few requests. To work around this,
two different GBFS API versions (v1.1 and v2.3) were fetched -- each
returns stations in a different internal order before hitting the same
truncation point -- and the results were merged/deduped by station_id,
yielding 280 unique, real, current stations with good geographic spread
across all 5 boroughs (lat 40.62-40.91, lon -74.04 to -73.83). This is a
~10% sample of the true system, not the complete inventory. It is real,
current, official data, just incomplete -- closest-station distances are
therefore systematically overestimated, especially in areas with locally
dense station clusters not captured in this sample. See
raw/citibike_stations.json and raw/citibike_raw_v1.txt / v2.txt.
"""
import json
import math
import os
from collections import Counter

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")
GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "neighborhoods.geojson")


def haversine_meters(lon1, lat1, lon2, lat2):
    R = 6371008.8  # mean Earth radius, meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def main():
    with open(os.path.join(DATA_DIR, "citibike_stations.json")) as f:
        stations = json.load(f)

    with open(GEOJSON_PATH) as f:
        geo = json.load(f)
    feats = geo["features"]
    print(f"Loaded {len(feats)} neighborhood features, {len(stations)} Citi Bike stations.")

    for feat in feats:
        props = feat["properties"]
        nlon, nlat = props["centroid_lon"], props["centroid_lat"]
        min_dist = min(
            haversine_meters(nlon, nlat, s["lon"], s["lat"]) for s in stations
        )
        props["distance_from_bikeshare"] = round(min_dist, 1)

    # rank-based quartile scoring, INVERTED (farthest-ranked -> score 3 = best)
    n = len(feats)
    sorted_feats = sorted(feats, key=lambda ft: ft["properties"]["distance_from_bikeshare"])
    q1 = n // 4
    q2 = 2 * (n // 4)
    q3 = 3 * (n // 4)
    for i, feat in enumerate(sorted_feats):
        if i < q1:
            score = 0
        elif i < q2:
            score = 1
        elif i < q3:
            score = 2
        else:
            score = 3
        feat["properties"]["bikeshare_score"] = score

    with open(GEOJSON_PATH, "w") as f:
        json.dump(geo, f)

    dist = Counter(ft["properties"]["bikeshare_score"] for ft in feats)
    print("bikeshare_score distribution:", dict(dist))
    closest = sorted(feats, key=lambda ft: ft["properties"]["distance_from_bikeshare"])[:5]
    farthest = sorted(feats, key=lambda ft: ft["properties"]["distance_from_bikeshare"])[-5:]
    print("Closest 5 to a Citi Bike station:")
    for ft in closest:
        print(" ", ft["properties"]["name"], ft["properties"]["distance_from_bikeshare"], ft["properties"]["bikeshare_score"])
    print("Farthest 5 from a Citi Bike station:")
    for ft in farthest:
        print(" ", ft["properties"]["name"], ft["properties"]["distance_from_bikeshare"], ft["properties"]["bikeshare_score"])


if __name__ == "__main__":
    main()
