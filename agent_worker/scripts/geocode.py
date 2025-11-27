#!/usr/bin/env python3
# ABOUTME: Geocodes a location name to geographic coordinates using Google Maps API.
# ABOUTME: Takes location string as CLI arg, outputs JSON with lat/lng to stdout.

import sys
import json
import os
import googlemaps

def main():
    if len(sys.argv) != 2:
        error = {"error": "Usage: geocode.py <location>"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    location = sys.argv[1]
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")

    if not api_key:
        error = {"error": "GOOGLE_MAPS_API_KEY environment variable not set"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    try:
        gmaps = googlemaps.Client(key=api_key)
        result = gmaps.geocode(location)

        if not result:
            error = {"error": f"Location not found: {location}"}
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)

        # Get first result
        geometry = result[0]["geometry"]["location"]
        formatted_address = result[0]["formatted_address"]

        output = {
            "lat": geometry["lat"],
            "lng": geometry["lng"],
            "formatted_address": formatted_address
        }

        print(json.dumps(output))
        sys.exit(0)

    except Exception as e:
        error = {"error": str(e)}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
