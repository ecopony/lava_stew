#!/usr/bin/env python3
# ABOUTME: Fetches transit infrastructure from OpenStreetMap via Overpass API.
# ABOUTME: Takes JSON args (lat, lon, radius), outputs GeoJSON with transit stops/stations.

import sys
import json
import requests
import time


def build_overpass_query(lat, lon, radius_meters):
    """Build Overpass QL query for transit infrastructure"""
    query = f"""
    [out:json][timeout:25];
    (
      node["highway"="bus_stop"](around:{radius_meters},{lat},{lon});
      node["railway"="station"](around:{radius_meters},{lat},{lon});
      node["railway"="tram_stop"](around:{radius_meters},{lat},{lon});
      node["railway"="subway_entrance"](around:{radius_meters},{lat},{lon});
    );
    out body;
    """
    return query


def convert_to_geojson(overpass_response):
    """Convert Overpass API response to GeoJSON FeatureCollection"""
    features = []

    for element in overpass_response.get("elements", []):
        if element["type"] != "node":
            continue

        tags = element.get("tags", {})

        # Determine transit type
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

        # Add optional tags
        if "operator" in tags:
            properties["operator"] = tags["operator"]
        if "network" in tags:
            properties["network"] = tags["network"]
        if "ref" in tags:
            properties["ref"] = tags["ref"]

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [element["lon"], element["lat"]]
            },
            "properties": properties
        }

        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features
    }


def main():
    if len(sys.argv) != 2:
        error = {"error": "Usage: fetch_transit_osm.py <json_args>"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        error = {"error": f"Invalid JSON arguments: {str(e)}"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    # Validate required arguments
    required = ["lat", "lon", "radius_meters"]
    for field in required:
        if field not in args:
            error = {"error": f"Missing required argument: {field}"}
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)

    lat = args["lat"]
    lon = args["lon"]
    radius_meters = args["radius_meters"]

    # Rate limit protection: Add 2-second delay before making request
    time.sleep(2)

    try:
        query = build_overpass_query(lat, lon, radius_meters)
        response = requests.post(
            "https://overpass-api.de/api/interpreter",
            data=query,
            timeout=30
        )

        if response.status_code == 429:
            error = {
                "error": "Overpass API rate limit exceeded (429)",
                "details": "Too many requests. Please wait before retrying.",
                "rate_limited": True
            }
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)
        elif response.status_code == 504:
            error = {
                "error": "Overpass API timeout (504)",
                "details": "Server is busy. Try a smaller radius or fewer categories.",
                "timeout": True
            }
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)
        elif response.status_code != 200:
            error = {
                "error": f"Overpass API error: {response.status_code}",
                "details": response.text
            }
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)

        overpass_data = response.json()
        geojson = convert_to_geojson(overpass_data)

        print(json.dumps(geojson))
        sys.exit(0)

    except requests.exceptions.RequestException as e:
        error = {"error": f"Network error: {str(e)}"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        error = {"error": f"Unexpected error: {str(e)}"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
