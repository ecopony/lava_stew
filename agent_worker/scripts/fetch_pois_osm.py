#!/usr/bin/env python3
# ABOUTME: Fetches points of interest from OpenStreetMap via Overpass API.
# ABOUTME: Takes JSON args (lat, lon, radius, categories), outputs GeoJSON to stdout.

import overpass_client


OPTIONAL_TAGS = ("cuisine", "opening_hours", "phone", "website")


def build_query(args):
    amenity_filter = "|".join(args["categories"])
    return f"""
    [out:json][timeout:25];
    (
      node["amenity"~"{amenity_filter}"](around:{args["radius_meters"]},{args["lat"]},{args["lon"]});
      way["amenity"~"{amenity_filter}"](around:{args["radius_meters"]},{args["lat"]},{args["lon"]});
    );
    out body center;
    """


def build_properties(element, tags):
    properties = {
        "osm_id": element["id"],
        "osm_type": element["type"],
        "category": tags.get("amenity", "unknown"),
        "name": tags.get("name", "Unnamed"),
    }
    for key in OPTIONAL_TAGS:
        if key in tags:
            properties[key] = tags[key]
    return properties


def main():
    overpass_client.run(
        "fetch_pois_osm.py",
        ["lat", "lon", "radius_meters", "categories"],
        build_query,
        build_properties,
    )


if __name__ == "__main__":
    main()
