#!/usr/bin/env python3
# ABOUTME: Fetches points of interest from OpenStreetMap via Overpass API.
# ABOUTME: Takes JSON args (lat, lon, radius, categories), outputs GeoJSON to stdout.

import sys
import json
import requests
import time


def build_overpass_query(lat, lon, radius_meters, categories):
    """Build Overpass QL query for POI amenities"""
    # Join categories with pipe for regex OR
    amenity_filter = "|".join(categories)

    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"~"{amenity_filter}"](around:{radius_meters},{lat},{lon});
      way["amenity"~"{amenity_filter}"](around:{radius_meters},{lat},{lon});
    );
    out body center;
    """
    return query


def convert_to_geojson(overpass_response):
    """Convert Overpass API response to GeoJSON FeatureCollection"""
    features = []

    for element in overpass_response.get("elements", []):
        # Get coordinates based on element type
        if element["type"] == "node":
            lon = element["lon"]
            lat = element["lat"]
        elif element["type"] == "way" and "center" in element:
            # For ways, use center point
            lon = element["center"]["lon"]
            lat = element["center"]["lat"]
        else:
            continue  # Skip elements without coordinates

        # Extract properties
        tags = element.get("tags", {})
        properties = {
            "osm_id": element["id"],
            "osm_type": element["type"],
            "category": tags.get("amenity", "unknown"),
            "name": tags.get("name", "Unnamed"),
        }

        # Add other useful tags
        if "cuisine" in tags:
            properties["cuisine"] = tags["cuisine"]
        if "opening_hours" in tags:
            properties["opening_hours"] = tags["opening_hours"]
        if "phone" in tags:
            properties["phone"] = tags["phone"]
        if "website" in tags:
            properties["website"] = tags["website"]

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
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
        error = {"error": "Usage: fetch_pois_osm.py <json_args>"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        error = {"error": f"Invalid JSON arguments: {str(e)}"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    # Validate required arguments
    required = ["lat", "lon", "radius_meters", "categories"]
    for field in required:
        if field not in args:
            error = {"error": f"Missing required argument: {field}"}
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)

    lat = args["lat"]
    lon = args["lon"]
    radius_meters = args["radius_meters"]
    categories = args["categories"]

    # Rate limit protection: Add 2-second delay before making request
    time.sleep(2)

    # Build and execute Overpass query
    try:
        query = build_overpass_query(lat, lon, radius_meters, categories)
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
