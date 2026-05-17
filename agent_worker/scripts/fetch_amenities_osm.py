#!/usr/bin/env python3
# ABOUTME: Fetches amenities (parks, attractions, museums) from OpenStreetMap via Overpass API.
# ABOUTME: Takes JSON args (lat, lon, radius), outputs GeoJSON with amenity features.

import overpass_client


OPTIONAL_TAGS = ("opening_hours", "website", "access")


def build_query(args):
    lat = args["lat"]
    lon = args["lon"]
    radius = args["radius_meters"]
    return f"""
    [out:json][timeout:25];
    (
      node["leisure"="park"](around:{radius},{lat},{lon});
      way["leisure"="park"](around:{radius},{lat},{lon});
      node["leisure"="playground"](around:{radius},{lat},{lon});
      way["leisure"="playground"](around:{radius},{lat},{lon});
      node["leisure"="garden"](around:{radius},{lat},{lon});
      way["leisure"="garden"](around:{radius},{lat},{lon});
      node["tourism"="attraction"](around:{radius},{lat},{lon});
      way["tourism"="attraction"](around:{radius},{lat},{lon});
      node["tourism"="museum"](around:{radius},{lat},{lon});
      way["tourism"="museum"](around:{radius},{lat},{lon});
    );
    out body center;
    """


def build_properties(element, tags):
    if "leisure" in tags:
        amenity_type = tags["leisure"]
    elif "tourism" in tags:
        amenity_type = tags["tourism"]
    else:
        amenity_type = "unknown"

    properties = {
        "osm_id": element["id"],
        "osm_type": element["type"],
        "amenity_type": amenity_type,
        "name": tags.get("name", "Unnamed"),
    }
    for key in OPTIONAL_TAGS:
        if key in tags:
            properties[key] = tags[key]
    return properties


def main():
    overpass_client.run(
        "fetch_amenities_osm.py",
        ["lat", "lon", "radius_meters"],
        build_query,
        build_properties,
    )


if __name__ == "__main__":
    main()
