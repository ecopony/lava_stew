#!/usr/bin/env python3
# ABOUTME: Calculates geodesic distance between two geographic points.
# ABOUTME: Takes two points as "lat1,lng1 lat2,lng2", outputs JSON with distance in km and miles.

import sys
import json
from geopy.distance import geodesic

def main():
    if len(sys.argv) != 3:
        error = {"error": "Usage: calculate_distance.py <lat1,lng1> <lat2,lng2>"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    try:
        # Parse first point
        point1_parts = sys.argv[1].split(",")
        if len(point1_parts) != 2:
            raise ValueError("Point 1 must be in format: lat,lng")
        lat1 = float(point1_parts[0])
        lng1 = float(point1_parts[1])

        # Parse second point
        point2_parts = sys.argv[2].split(",")
        if len(point2_parts) != 2:
            raise ValueError("Point 2 must be in format: lat,lng")
        lat2 = float(point2_parts[0])
        lng2 = float(point2_parts[1])

        # Calculate distance
        point1 = (lat1, lng1)
        point2 = (lat2, lng2)
        distance = geodesic(point1, point2)

        output = {
            "distance_km": round(distance.kilometers, 2),
            "distance_miles": round(distance.miles, 2)
        }

        print(json.dumps(output))
        sys.exit(0)

    except ValueError as e:
        error = {"error": f"Invalid input: {str(e)}"}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        error = {"error": str(e)}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
