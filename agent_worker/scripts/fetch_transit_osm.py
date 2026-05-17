#!/usr/bin/env python3
# ABOUTME: Fetches transit infrastructure from OpenStreetMap via Overpass API.
# ABOUTME: Takes JSON args (lat, lon, radius), outputs GeoJSON with transit stops/stations.

import overpass_client


OPTIONAL_TAGS = ("operator", "network", "ref")


def build_query(args):
    lat = args["lat"]
    lon = args["lon"]
    radius = args["radius_meters"]
    return f"""
    [out:json][timeout:25];
    (
      node["highway"="bus_stop"](around:{radius},{lat},{lon});
      node["railway"="station"](around:{radius},{lat},{lon});
      node["railway"="tram_stop"](around:{radius},{lat},{lon});
      node["railway"="subway_entrance"](around:{radius},{lat},{lon});
    );
    out body;
    """


def build_properties(element, tags):
    if "highway" in tags:
        transit_type = tags["highway"]
    elif "railway" in tags:
        transit_type = tags["railway"]
    else:
        transit_type = "unknown"

    properties = {
        "osm_id": element["id"],
        "transit_type": transit_type,
        "name": tags.get("name", "Unnamed"),
    }
    for key in OPTIONAL_TAGS:
        if key in tags:
            properties[key] = tags[key]
    return properties


def main():
    overpass_client.run(
        "fetch_transit_osm.py",
        ["lat", "lon", "radius_meters"],
        build_query,
        build_properties,
    )


if __name__ == "__main__":
    main()
