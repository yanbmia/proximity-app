"""
Convert raw Trader Joe's / Whole Foods location lists (raw/trader_joes.json,
raw/whole_foods.json -- plain JSON arrays of {name, address, borough, lon,
lat}) into GeoJSON FeatureCollections under src/data/, mirroring bayborhood's
trader_joes_coordinates.geojson / whole_foods_coordinates.geojson, which
Home.js's showMarkers() loads to drop pins on the map.

(Gyms are intentionally excluded -- gym sourcing was dropped from this
project's scope.)
"""
import json
import os

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "raw")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "data")


def convert(raw_filename, out_filename):
    with open(os.path.join(RAW_DIR, raw_filename)) as f:
        records = json.load(f)

    features = []
    for rec in records:
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [rec["lon"], rec["lat"]]},
                "properties": {"name": rec["name"], "address": rec.get("address", ""), "borough": rec.get("borough", "")},
            }
        )

    fc = {"type": "FeatureCollection", "features": features}
    out_path = os.path.join(OUT_DIR, out_filename)
    with open(out_path, "w") as f:
        json.dump(fc, f)
    print(f"Wrote {len(features)} features to {out_path}")


def main():
    convert("trader_joes.json", "trader_joes_coordinates.geojson")
    convert("whole_foods.json", "whole_foods_coordinates.geojson")


if __name__ == "__main__":
    main()
