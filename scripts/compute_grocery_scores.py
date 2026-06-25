"""
Compute Trader Joe's / Whole Foods proximity scores for uni-hood NYC neighborhoods.

Mirrors the ORIGINAL bayborhood (SF) methodology exactly, including its
unusual inverted scoring convention, found in "Neighborhood Manipulation.ipynb"
(whole_foods_score / trader_joes_score / gym_score cells):

  1. For each neighborhood centroid, find the geodesic distance to the
     NEAREST store of that chain (minimum over all stores of that chain).
  2. Compute VALUE-based quartiles of the distance distribution via
     percentile (25th/50th/75th) -- i.e. np.percentile, NOT index/rank based
     (this differs from the parks/hubs/crime scoring, which IS index-based).
  3. Score is INVERTED relative to "closer is better" intuition:
       distance <= Q1 (closest quarter)  -> score 0 (worst)
       distance <= Q2                    -> score 1
       distance <= Q3                    -> score 2
       distance >  Q3 (farthest quarter) -> score 3 (best)
     This looks backwards, but it is EXACTLY what the original SF app does.
     Carried forward here verbatim for full feature parity with bayborhood.

Trader Joe's and Whole Foods locations: sourced from each chain's official
store locator (locations.traderjoes.com; Whole Foods NY-state store list
cross-referenced against the official site), restricted to the 5 NYC
boroughs, geocoded via the US Census Bureau geocoder. See raw/trader_joes.json
and raw/whole_foods.json.
"""
import json
import math
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")
GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "neighborhoods.geojson")


def haversine_meters(lon1, lat1, lon2, lat2):
    R = 6371008.8  # mean Earth radius, meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def percentile(sorted_values, pct):
    """Linear-interpolation percentile matching numpy.percentile's default
    ('linear') method, given an already-sorted list of values."""
    n = len(sorted_values)
    if n == 1:
        return sorted_values[0]
    rank = (pct / 100.0) * (n - 1)
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return sorted_values[lo]
    frac = rank - lo
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * frac


def score_by_distance(geo_feats, stores, dist_field, score_field):
    for feat in geo_feats:
        props = feat["properties"]
        nlon, nlat = props["centroid_lon"], props["centroid_lat"]
        min_dist = min(
            haversine_meters(nlon, nlat, s["lon"], s["lat"]) for s in stores
        )
        props[dist_field] = round(min_dist, 1)

    distances_sorted = sorted(f["properties"][dist_field] for f in geo_feats)
    q1 = percentile(distances_sorted, 25)
    q2 = percentile(distances_sorted, 50)
    q3 = percentile(distances_sorted, 75)

    for feat in geo_feats:
        d = feat["properties"][dist_field]
        if d <= q1:
            score = 0
        elif d <= q2:
            score = 1
        elif d <= q3:
            score = 2
        else:
            score = 3
        feat["properties"][score_field] = score

    return q1, q2, q3


def main():
    with open(os.path.join(DATA_DIR, "trader_joes.json")) as f:
        trader_joes = json.load(f)
    with open(os.path.join(DATA_DIR, "whole_foods.json")) as f:
        whole_foods = json.load(f)

    with open(GEOJSON_PATH) as f:
        geo = json.load(f)
    feats = geo["features"]
    print(f"Loaded {len(feats)} neighborhood features, "
          f"{len(trader_joes)} Trader Joe's, {len(whole_foods)} Whole Foods.")

    tj_q = score_by_distance(feats, trader_joes, "distance_from_trader_joes", "trader_joes_score")
    wf_q = score_by_distance(feats, whole_foods, "distance_from_whole_foods", "whole_foods_score")

    with open(GEOJSON_PATH, "w") as f:
        json.dump(geo, f)

    from collections import Counter
    print("trader_joes_score distribution:", dict(Counter(f["properties"]["trader_joes_score"] for f in feats)), "quartiles:", tj_q)
    print("whole_foods_score distribution:", dict(Counter(f["properties"]["whole_foods_score"] for f in feats)), "quartiles:", wf_q)

    closest_tj = sorted(feats, key=lambda f: f["properties"]["distance_from_trader_joes"])[:3]
    farthest_tj = sorted(feats, key=lambda f: f["properties"]["distance_from_trader_joes"])[-3:]
    print("Closest 3 to a Trader Joe's:")
    for f in closest_tj:
        print(" ", f["properties"]["name"], f["properties"]["distance_from_trader_joes"], f["properties"]["trader_joes_score"])
    print("Farthest 3 from a Trader Joe's:")
    for f in farthest_tj:
        print(" ", f["properties"]["name"], f["properties"]["distance_from_trader_joes"], f["properties"]["trader_joes_score"])


if __name__ == "__main__":
    main()
