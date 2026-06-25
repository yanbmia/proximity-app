"""
Compute budget (rent) data for uni-hood NYC neighborhoods.

ORIGINAL bayborhood (SF) methodology, reverse-engineered from
"Neighborhood Manipulation.ipynb" cells 65-70:
  1. Spatially join each neighborhood polygon to ONE zip code (first
     intersecting match against a zip boundary geojson).
  2. For each unique zip, call rentcast.io's markets endpoint and pull
     `rentalData.averageRent` (a single blended dollar figure).
  3. Store the RAW dollar value as `feature.properties.cost` -- NOT a
     0-3 quartile score like every other filter. Home.js then dims any
     neighborhood whose `cost` >= a user-controlled slider ceiling
     (`budgetMax`) by 0.5 opacity.

NYC adaptation (this script):
  rentcast.io requires a paid API key, so this uses HUD's Small Area
  Fair Market Rents (SAFMR) dataset instead -- a real, free, no-key,
  federal dataset computed at ZIP-code (ZCTA) granularity for HUD's
  designated large metro areas (NYC is one), making it a direct analog
  of rentcast's per-zip averageRent. Source: HUD SAFMR ArcGIS
  FeatureServer (services.arcgis.com/VTyQ9soqVukalItT/.../
  HUD_PDR_Small_Area_Fair_Market_Rents/FeatureServer), retrieved via
  two layers:
    - Layer 0 "SAFMR_Zip_Code_Tab_Areas": ZCTA polygons with fields
      ZCTA5CE20 (zip) and INTPTLAT20/INTPTLON20 (zip centroid).
    - Layer 1 "SAFMR_table": one row per zip (joined via layer1.ID ==
      layer0.ZCTA5CE20) with SAFMR_0BR..SAFMR_4BR dollar figures.

  Representative dollar figure: SAFMR_1BR (one-bedroom Fair Market
  Rent) is used as `cost`, rather than blending across all unit sizes.
  Rationale: uni-hood's whole premise centers on proximity to
  universities (the Hubs filter), so its renter persona skews toward
  students / young professionals for whom a studio or 1BR is the
  realistic unit type -- pulling in family-sized 3-4BR rents (which
  run far higher) would skew the "budget" figure away from what this
  audience actually shops for. This is a deliberate adaptation, not a
  like-for-like match to rentcast's blended average.

  Spatial join: simplified to nearest-centroid (neighborhood centroid
  -> nearest NYC zip centroid) rather than the original's true polygon
  intersection, consistent with every other distance-based filter in
  this project (parks, groceries, subway, bikeshare, hubs all use
  centroid distance). A separate NYC zip-boundary polygon file was not
  sourced since centroid matching is already the project's established
  pattern and avoids an extra dependency.

  NYC zip whitelist: HUD's dataset spans NY/NJ broadly when queried by
  numeric ID range, so a hardcoded whitelist of real NYC ZCTAs (by
  borough, standard USPS/Census assignment) is used to exclude
  Westchester, Rockland, Nassau, and Suffolk county zips that fall in
  the same numeric range. Floral Park (11001) and its immediate Nassau
  neighbors (11003, 11005) are excluded since they're predominantly
  Nassau County, not NYC proper.
"""
import json
import math
import os
from collections import Counter

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")
GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "neighborhoods.geojson")

# Authoritative whitelist of real NYC ZIP Code Tabulation Areas (ZCTAs), by borough.
NYC_ZIPS = set(
    # Manhattan
    [
        "10001", "10002", "10003", "10004", "10005", "10006", "10007", "10009",
        "10010", "10011", "10012", "10013", "10014", "10016", "10017", "10018",
        "10019", "10020", "10021", "10022", "10023", "10024", "10025", "10026",
        "10027", "10028", "10029", "10030", "10031", "10032", "10033", "10034",
        "10035", "10036", "10037", "10038", "10039", "10040", "10044", "10065",
        "10069", "10075", "10103", "10110", "10111", "10112", "10115", "10119",
        "10128", "10152", "10153", "10154", "10162", "10165", "10167", "10168",
        "10169", "10170", "10171", "10172", "10173", "10174", "10177", "10199",
        "10271", "10278", "10279", "10280", "10282",
    ]
    # Bronx
    + [
        "10451", "10452", "10453", "10454", "10455", "10456", "10457", "10458",
        "10459", "10460", "10461", "10462", "10463", "10464", "10465", "10466",
        "10467", "10468", "10469", "10470", "10471", "10472", "10473", "10474",
        "10475",
    ]
    # Staten Island
    + [
        "10301", "10302", "10303", "10304", "10305", "10306", "10307", "10308",
        "10309", "10310", "10311", "10312", "10314",
    ]
    # Brooklyn
    + [
        "11201", "11203", "11204", "11205", "11206", "11207", "11208", "11209",
        "11210", "11211", "11212", "11213", "11214", "11215", "11216", "11217",
        "11218", "11219", "11220", "11221", "11222", "11223", "11224", "11225",
        "11226", "11228", "11229", "11230", "11231", "11232", "11233", "11234",
        "11235", "11236", "11237", "11238", "11239", "11249",
    ]
    # Queens
    + [
        "11004", "11101", "11102", "11103", "11104", "11105", "11106", "11109",
        "11354", "11355", "11356", "11357", "11358", "11359", "11360", "11361",
        "11362", "11363", "11364", "11365", "11366", "11367", "11368", "11369",
        "11370", "11371", "11372", "11373", "11374", "11375", "11377", "11378",
        "11379", "11385", "11411", "11412", "11413", "11414", "11415", "11416",
        "11417", "11418", "11419", "11420", "11421", "11422", "11423", "11424",
        "11426", "11427", "11428", "11429", "11430", "11432", "11433", "11434",
        "11435", "11436", "11439", "11451", "11691", "11692", "11693", "11694",
        "11697",
    ]
)


def haversine_meters(lon1, lat1, lon2, lat2):
    R = 6371008.8  # mean Earth radius, meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def main():
    with open(os.path.join(DATA_DIR, "safmr_zips_centroids.json")) as f:
        centroid_data = json.load(f)

    zip_centroids = {}
    for feat in centroid_data["features"]:
        attrs = feat["attributes"]
        z = attrs["ZCTA5CE20"]
        if z in NYC_ZIPS:
            zip_centroids[z] = (float(attrs["INTPTLON20"]), float(attrs["INTPTLAT20"]))

    rent_records = []
    with open(os.path.join(DATA_DIR, "safmr_rents_partial.json")) as f:
        rent_records.extend(json.load(f))
    with open(os.path.join(DATA_DIR, "safmr_rents_rockaways.json")) as f:
        rent_records.extend(json.load(f))

    zip_rent = {}
    for rec in rent_records:
        z = rec["ID"]
        if z in NYC_ZIPS and z not in zip_rent:
            zip_rent[z] = rec["SAFMR_1BR"]

    missing = NYC_ZIPS - set(zip_rent.keys())
    missing_centroid = NYC_ZIPS - set(zip_centroids.keys())
    print(f"NYC zip whitelist size: {len(NYC_ZIPS)}")
    print(f"Zips with rent data: {len(zip_rent)} (missing: {sorted(missing)})")
    print(f"Zips with centroid data: {len(zip_centroids)} (missing centroid: {sorted(missing_centroid)})")

    # Only use zips that have BOTH a centroid and a rent figure for the nearest-zip join.
    usable_zips = [z for z in NYC_ZIPS if z in zip_centroids and z in zip_rent]
    print(f"Usable zips (centroid + rent): {len(usable_zips)}")

    with open(GEOJSON_PATH) as f:
        geo = json.load(f)
    feats = geo["features"]
    print(f"Loaded {len(feats)} neighborhood features.")

    for feat in feats:
        props = feat["properties"]
        nlon, nlat = props["centroid_lon"], props["centroid_lat"]
        nearest_zip = min(
            usable_zips,
            key=lambda z: haversine_meters(nlon, nlat, zip_centroids[z][0], zip_centroids[z][1]),
        )
        props["zip"] = nearest_zip
        props["cost"] = zip_rent[nearest_zip]

    with open(GEOJSON_PATH, "w") as f:
        json.dump(geo, f)

    costs = [ft["properties"]["cost"] for ft in feats]
    print(f"cost (1BR SAFMR) range: ${min(costs)} - ${max(costs)}")
    print(f"cost distribution by $250 bucket:", dict(sorted(Counter(c // 250 * 250 for c in costs).items())))
    cheapest = sorted(feats, key=lambda ft: ft["properties"]["cost"])[:5]
    priciest = sorted(feats, key=lambda ft: ft["properties"]["cost"])[-5:]
    print("Cheapest 5:")
    for ft in cheapest:
        print(" ", ft["properties"]["name"], ft["properties"]["zip"], ft["properties"]["cost"])
    print("Priciest 5:")
    for ft in priciest:
        print(" ", ft["properties"]["name"], ft["properties"]["zip"], ft["properties"]["cost"])


if __name__ == "__main__":
    main()
