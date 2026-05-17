# ABOUTME: Shared HTTP client and CLI runner for Overpass API scripts.
# ABOUTME: Owns the POST shape, status-code handling, GeoJSON shell, and argv plumbing.

import sys
import json
import time
import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "lava-stew/0.1 (https://github.com/ecopony/lava_stew)"
RATE_LIMIT_DELAY_SECONDS = 2
REQUEST_TIMEOUT_SECONDS = 30


class OverpassError(Exception):
    def __init__(self, payload):
        self.payload = payload
        super().__init__(payload.get("error"))


def execute(query):
    response = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if response.status_code == 429:
        raise OverpassError({
            "error": "Overpass API rate limit exceeded (429)",
            "details": "Too many requests. Please wait before retrying.",
            "rate_limited": True,
        })
    if response.status_code == 504:
        raise OverpassError({
            "error": "Overpass API timeout (504)",
            "details": "Server is busy. Try a smaller radius or fewer categories.",
            "timeout": True,
        })
    if response.status_code != 200:
        raise OverpassError({
            "error": f"Overpass API error: {response.status_code}",
            "details": response.text,
        })

    return response.json()


def to_geojson(overpass_response, build_properties):
    """Wrap Overpass elements as a GeoJSON FeatureCollection.

    build_properties(element, tags) -> dict | None returns per-feature
    properties. Returning None skips the element.
    """
    features = []

    for element in overpass_response.get("elements", []):
        if element["type"] == "node":
            lon = element["lon"]
            lat = element["lat"]
        elif element["type"] == "way" and "center" in element:
            lon = element["center"]["lon"]
            lat = element["center"]["lat"]
        else:
            continue

        tags = element.get("tags", {})
        properties = build_properties(element, tags)
        if properties is None:
            continue

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": properties,
        })

    return {"type": "FeatureCollection", "features": features}


def run(script_name, required_args, build_query, build_properties):
    """CLI entrypoint shared by Overpass-backed scripts."""
    if len(sys.argv) != 2:
        _die({"error": f"Usage: {script_name} <json_args>"})

    try:
        args = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        _die({"error": f"Invalid JSON arguments: {str(e)}"})

    for field in required_args:
        if field not in args:
            _die({"error": f"Missing required argument: {field}"})

    time.sleep(RATE_LIMIT_DELAY_SECONDS)

    try:
        overpass_data = execute(build_query(args))
        print(json.dumps(to_geojson(overpass_data, build_properties)))
        sys.exit(0)
    except OverpassError as e:
        _die(e.payload)
    except requests.exceptions.RequestException as e:
        _die({"error": f"Network error: {str(e)}"})
    except Exception as e:
        _die({"error": f"Unexpected error: {str(e)}"})


def _die(payload):
    print(json.dumps(payload), file=sys.stderr)
    sys.exit(1)
