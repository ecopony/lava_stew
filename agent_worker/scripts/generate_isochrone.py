#!/usr/bin/env python3
# ABOUTME: Generates walking time isochrone polygons using OpenRouteService API.
# ABOUTME: Takes JSON args (lat, lon, time_intervals), outputs GeoJSON with polygons.

import sys
import json
import os
import requests


def main():
    if len(sys.argv) != 2:
        error = {"error": "Usage: generate_isochrone.py <json_args>"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    api_key = os.environ.get("OPENROUTESERVICE_API_KEY")
    if not api_key:
        error = {"error": "OPENROUTESERVICE_API_KEY environment variable not set"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        error = {"error": f"Invalid JSON arguments: {str(e)}"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    # Validate required arguments
    required = ["lat", "lon", "time_intervals"]
    for field in required:
        if field not in args:
            error = {"error": f"Missing required argument: {field}"}
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)

    lat = args["lat"]
    lon = args["lon"]
    time_intervals = args["time_intervals"]

    # Convert time intervals from minutes to seconds
    range_seconds = [minutes * 60 for minutes in time_intervals]

    # Build OpenRouteService API request
    ors_url = "https://api.openrouteservice.org/v2/isochrones/foot-walking"
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "locations": [[lon, lat]],
        "range": range_seconds,
        "range_type": "time"
    }

    try:
        response = requests.post(
            ors_url,
            json=payload,
            headers=headers,
            timeout=30
        )

        if response.status_code != 200:
            error = {
                "error": f"OpenRouteService API error: {response.status_code}",
                "details": response.text
            }
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)

        ors_data = response.json()

        # Enhance features with additional properties
        for i, feature in enumerate(ors_data["features"]):
            value_seconds = feature["properties"]["value"]
            feature["properties"]["time_minutes"] = value_seconds // 60
            feature["properties"]["mode"] = "walking"

        print(json.dumps(ors_data))
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
