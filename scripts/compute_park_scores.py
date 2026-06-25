"""
Compute park proximity scores for uni-hood NYC neighborhoods.

Mirrors the original bayborhood (SF) methodology found in
"Neighborhood Manipulation.ipynb":
  1. Use park POINT (centroid), not polygon boundary.
  2. For each neighborhood, take its centroid and find the geodesic
     distance to the NEAREST park centroid (minimum over all parks).
  3. Sort neighborhoods by that distance ascending.
  4. Split into 4 buckets using floor(n/4) index cutoffs (closest bucket
     first); closest bucket -> score 3 (best), next -> 2, next -> 1,
     remaining (farthest, gets the remainder) -> 0 (worst).

Park categories included (DPR Parks Properties dataset, resource enfh-gkve):
  Flagship Park, Community Park, Nature Area, Neighborhood Park.
Triangle/Plaza (355 tiny street-triangle parcels) intentionally excluded:
  low signal for neighborhood-matching purposes, consistent with the SF
  original excluding "playground"-labeled small parcels.

No shapely/geopy available in this sandbox (no network access for pip),
so polygon centroid and geodesic distance are implemented from scratch
in pure Python below.
"""
import json
import math
import glob
import os

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")
GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "neighborhoods.geojson")

PARK_FILES = [
    "parks_flagship.json",
    "parks_community_1.json",
    "parks_community_2.json",
    "parks_community_3.json",
    "parks_nature_1.json",
    "parks_nature_2.json",
    "parks_neighborhood_1.json",
    "parks_neighborhood_2.json",
    "parks_neighborhood_3.json",
    "parks_neighborhood_4.json",
    "parks_neighborhood_5.json",
    "parks_neighborhood_6.json",
]


def ring_area_and_centroid(ring):
    """Shoelace-formula signed area and centroid for a single linear ring
    of (lon, lat) pairs (planar approx in degree-space, matching the
    original bayborhood approach of not reprojecting before centroid calc)."""
    n = len(ring)
    if n < 3:
        return 0.0, ring[0][0], ring[0][1]
    a_sum = 0.0
    cx_sum = 0.0
    cy_sum = 0.0
    for i in range(n - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        a_sum += cross
        cx_sum += (x0 + x1) * cross
        cy_sum += (y0 + y1) * cross
    area = a_sum / 2.0
    if abs(area) < 1e-12:
        # degenerate ring (sliver / duplicate points) -> fall back to vertex mean
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return 0.0, sum(xs) / len(xs), sum(ys) / len(ys)
    cx = cx_sum / (6 * area)
    cy = cy_sum / (6 * area)
    return abs(area), cx, cy


def multipolygon_centroid(geom):
    """Area-weighted centroid across all polygons in a MultiPolygon.
    Uses only each polygon's exterior ring (rings[0]); holes ignored
    (none of the source data in this dataset actually contains holes —
    verified: every polygon entry has exactly one ring)."""
    total_area = 0.0
    cx_sum = 0.0
    cy_sum = 0.0
    polygons = geom["coordinates"]
    for poly in polygons:
        exterior = poly[0]
        area, cx, cy = ring_area_and_centroid(exterior)
        if area == 0.0:
            # degenerate polygon: give it a tiny nominal weight so it can
            # still contribute a position without dividing by zero overall
            area = 1e-9
        total_area += area
        cx_sum += cx * area
        cy_sum += cy * area
    if total_area == 0.0:
        # shouldn't happen, but guard anyway
        poly = polygons[0][0]
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx_sum / total_area, cy_sum / total_area


def haversine_meters(lon1, lat1, lon2, lat2):
    R = 6371008.8  # mean Earth radius, meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def load_park_centroids():
    centroids = []
    total_records = 0
    skipped_null = 0
    for fname in PARK_FILES:
        path = os.path.join(RAW_DIR, fname)
        with open(path) as f:
            records = json.load(f)
        for rec in records:
            total_records += 1
            geom = rec.get("geom")
            if not geom:
                skipped_null += 1
                continue
            cx, cy = multipolygon_centroid(geom)
            centroids.append((cx, cy))
    print(f"Loaded {total_records} park records across {len(PARK_FILES)} files; "
          f"{skipped_null} had NULL geometry (skipped); "
          f"{len(centroids)} usable park centroids.")
    return centroids


def main():
    park_centroids = load_park_centroids()

    with open(GEOJSON_PATH) as f:
        geo = json.load(f)
    feats = geo["features"]
    print(f"Loaded {len(feats)} neighborhood features.")

    # 1. compute nearest-park distance for every neighborhood
    for feat in feats:
        props = feat["properties"]
        nlon, nlat = props["centroid_lon"], props["centroid_lat"]
        min_dist = None
        for plon, plat in park_centroids:
            d = haversine_meters(nlon, nlat, plon, plat)
            if min_dist is None or d < min_dist:
                min_dist = d
        props["distance_from_park"] = round(min_dist, 1)

    # 2. rank-based quartile scoring (closest quartile = 3 = best),
    #    mirroring bayborhood's index-cutoff pattern exactly
    n = len(feats)
    sorted_feats = sorted(feats, key=lambda ft: ft["properties"]["distance_from_park"])
    q1 = n // 4
    q2 = 2 * (n // 4)
    q3 = 3 * (n // 4)
    for i, feat in enumerate(sorted_feats):
        if i < q1:
            score = 3
        elif i < q2:
            score = 2
        elif i < q3:
            score = 1
        else:
            score = 0
        feat["properties"]["park_score"] = score

    with open(GEOJSON_PATH, "w") as f:
        json.dump(geo, f)

    # sanity print
    from collections import Counter
    dist = Counter(ft["properties"]["park_score"] for ft in feats)
    print("park_score distribution:", dict(dist))
    closest = sorted(feats, key=lambda ft: ft["properties"]["distance_from_park"])[:5]
    farthest = sorted(feats, key=lambda ft: ft["properties"]["distance_from_park"])[-5:]
    print("Closest 5:")
    for ft in closest:
        print(" ", ft["properties"]["name"], ft["properties"]["distance_from_park"], ft["properties"]["park_score"])
    print("Farthest 5:")
    for ft in farthest:
        print(" ", ft["properties"]["name"], ft["properties"]["distance_from_park"], ft["properties"]["park_score"])


if __name__ == "__main__":
    main()
