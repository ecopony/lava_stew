#!/usr/bin/env python3
# ABOUTME: Analyzes geospatial data to compute location intelligence metrics.
# ABOUTME: Takes GeoJSON strings and center point, outputs analysis metrics as JSON.

import sys
import json
import logging
import geopandas as gpd
from shapely.geometry import Point, shape
from scipy.spatial.distance import cdist
import numpy as np

# Set up logging to stderr
logging.basicConfig(
    level=logging.INFO,
    format='[ANALYZE] %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


def load_geojson_string(geojson_str):
    """Load GeoJSON from string and return GeoDataFrame"""
    data = json.loads(geojson_str)

    if not data.get("features"):
        # Return empty GeoDataFrame with proper CRS
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    return gpd.GeoDataFrame.from_features(data["features"], crs="EPSG:4326")


def calculate_density(gdf, radius_meters):
    """Calculate density per square kilometer"""
    # Calculate area in square kilometers
    # For rough approximation at mid-latitudes, 1 degree ~ 111 km
    radius_km = radius_meters / 1000.0
    area_sq_km = np.pi * (radius_km ** 2)

    count = len(gdf)
    density = count / area_sq_km if area_sq_km > 0 else 0
    return density


def calculate_average_distance(from_point, to_gdf):
    """Calculate average distance from point to features in GeoDataFrame"""
    if len(to_gdf) == 0:
        return None

    distances = []
    for _, feature in to_gdf.iterrows():
        geom = feature.geometry
        if geom.geom_type == 'Point':
            # Calculate distance in meters (rough approximation)
            lat_diff = (geom.y - from_point.y) * 111000
            lon_diff = (geom.x - from_point.x) * 111000 * np.cos(np.radians(from_point.y))
            dist = np.sqrt(lat_diff**2 + lon_diff**2)
            distances.append(dist)

    return np.mean(distances) if distances else None


def count_features_in_isochrone(features_gdf, isochrone_polygon):
    """Count how many features fall within an isochrone polygon"""
    if len(features_gdf) == 0:
        return 0

    count = 0
    for _, feature in features_gdf.iterrows():
        if feature.geometry.within(isochrone_polygon):
            count += 1

    return count


def analyze_isochrone_coverage(pois_gdf, transit_gdf, amenities_gdf, isochrones_gdf):
    """Analyze what's accessible within each walking time interval"""
    coverage = {}

    for _, isochrone in isochrones_gdf.iterrows():
        time_minutes = isochrone["time_minutes"]
        polygon = isochrone.geometry

        # Count features within this isochrone
        pois_count = count_features_in_isochrone(pois_gdf, polygon)
        transit_count = count_features_in_isochrone(transit_gdf, polygon)
        amenities_count = count_features_in_isochrone(amenities_gdf, polygon)

        # Count by category
        restaurants = 0
        parks = 0
        if len(pois_gdf) > 0 and "category" in pois_gdf.columns:
            for _, poi in pois_gdf.iterrows():
                if poi.geometry.within(polygon):
                    if poi["category"] == "restaurant":
                        restaurants += 1

        if len(amenities_gdf) > 0 and "amenity_type" in amenities_gdf.columns:
            for _, amenity in amenities_gdf.iterrows():
                if amenity.geometry.within(polygon):
                    if amenity["amenity_type"] == "park":
                        parks += 1

        # Calculate area using Shapely's polygon.area (in square degrees)
        # Convert to km² using latitude correction: 1 sq degree ≈ 111² × cos(lat) km²
        centroid = polygon.centroid
        lat_radians = np.radians(centroid.y)
        sq_deg_to_sq_km = (111 ** 2) * np.cos(lat_radians)
        area_sq_km = polygon.area * sq_deg_to_sq_km

        coverage[f"{time_minutes}min_walk"] = {
            "pois": pois_count,
            "restaurants": restaurants,
            "transit_stops": transit_count,
            "parks": parks,
            "amenities": amenities_count,
            "area_sq_km": round(area_sq_km, 2)
        }

    return coverage


def simple_clustering(gdf, category_field=None, category_value=None):
    """Simple clustering: find groups of nearby features"""
    if len(gdf) == 0:
        return []

    # Filter by category if specified
    if category_field and category_value and category_field in gdf.columns:
        filtered = gdf[gdf[category_field] == category_value]
    else:
        filtered = gdf

    if len(filtered) < 3:
        return []

    # Get coordinates
    coords = np.array([[p.x, p.y] for p in filtered.geometry])

    # Calculate pairwise distances
    distances = cdist(coords, coords)

    # Find clusters (simple approach: features within ~100m of each other)
    threshold_degrees = 0.001  # Roughly 100m
    clusters = []

    visited = set()
    for i in range(len(coords)):
        if i in visited:
            continue

        # Find nearby features
        nearby = [j for j in range(len(coords)) if distances[i][j] < threshold_degrees and j not in visited]

        if len(nearby) >= 3:  # Cluster needs at least 3 features
            center = coords[nearby].mean(axis=0)
            visited.update(nearby)
            clusters.append({
                "type": f"{category_value}_cluster" if category_value else "cluster",
                "center": [float(center[1]), float(center[0])],  # [lat, lon]
                "count": len(nearby),
                "within_5min_walk": True  # Simplified assumption
            })

    return clusters


def main():
    if len(sys.argv) != 2:
        error = {"error": "Usage: analyze_location_data.py <json_args>"}
        logger.error(json.dumps(error))
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        error = {"error": f"Invalid JSON arguments: {str(e)}"}
        logger.error(json.dumps(error))
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)

    # Validate required arguments
    required = ["pois_geojson", "transit_geojson", "amenities_geojson", "isochrones_geojson",
                "center_lat", "center_lon", "radius_meters"]
    for field in required:
        if field not in args:
            error = {"error": f"Missing required argument: {field}"}
            logger.error(json.dumps(error))
            print(json.dumps(error), file=sys.stderr)
            sys.exit(1)

    try:
        # Load GeoJSON from strings
        pois_gdf = load_geojson_string(args["pois_geojson"])
        transit_gdf = load_geojson_string(args["transit_geojson"])
        amenities_gdf = load_geojson_string(args["amenities_geojson"])
        isochrones_gdf = load_geojson_string(args["isochrones_geojson"])

        center_point = Point(args["center_lon"], args["center_lat"])
        radius_meters = args["radius_meters"]

        # Log input data summary
        logger.info(f"Processing location at ({args['center_lat']}, {args['center_lon']})")
        logger.info(f"Input: {len(pois_gdf)} POIs, {len(transit_gdf)} transit stops, {len(amenities_gdf)} amenities, {len(isochrones_gdf)} isochrones")

        # Calculate density metrics
        density = {
            "pois_per_sq_km": round(calculate_density(pois_gdf, radius_meters), 1),
            "transit_stops_per_sq_km": round(calculate_density(transit_gdf, radius_meters), 1)
        }

        # Calculate walkability metrics
        avg_dist_transit = calculate_average_distance(center_point, transit_gdf)
        avg_dist_park = calculate_average_distance(center_point, amenities_gdf)

        walkability = {
            "avg_meters_to_transit": round(avg_dist_transit) if avg_dist_transit else None,
            "avg_meters_to_park": round(avg_dist_park) if avg_dist_park else None
        }

        # Log density and walkability metrics
        logger.info(f"Density: {density['pois_per_sq_km']} POIs/km², {density['transit_stops_per_sq_km']} transit/km²")
        transit_str = f"{walkability['avg_meters_to_transit']}m" if walkability['avg_meters_to_transit'] else "N/A"
        park_str = f"{walkability['avg_meters_to_park']}m" if walkability['avg_meters_to_park'] else "N/A"
        logger.info(f"Walkability: {transit_str} to transit, {park_str} to park")

        # Analyze isochrone coverage
        isochrone_coverage = analyze_isochrone_coverage(
            pois_gdf, transit_gdf, amenities_gdf, isochrones_gdf
        )

        # Find clusters
        clusters = simple_clustering(pois_gdf, "category", "restaurant")

        # Calculate coverage ratios (simplified)
        total_pois = len(pois_gdf)
        coverage_5min = isochrone_coverage.get("5min_walk", {}).get("pois", 0)
        coverage_10min = isochrone_coverage.get("10min_walk", {}).get("pois", 0)

        coverage = {
            "pois_accessible_5min": round(coverage_5min / total_pois, 2) if total_pois > 0 else 0,
            "pois_accessible_10min": round(coverage_10min / total_pois, 2) if total_pois > 0 else 0
        }

        # Log coverage and cluster analysis
        pct_5min = coverage["pois_accessible_5min"] * 100
        pct_10min = coverage["pois_accessible_10min"] * 100
        logger.info(f"Coverage: {pct_5min:.0f}% POIs within 5min, {pct_10min:.0f}% within 10min")
        logger.info(f"Found {len(clusters)} restaurant cluster(s)")

        # Build output
        result = {
            "density": density,
            "walkability": walkability,
            "isochrone_coverage": isochrone_coverage,
            "clusters": clusters,
            "coverage": coverage
        }

        logger.info(f"Analysis complete: {json.dumps(result)}")
        print(json.dumps(result))
        sys.exit(0)

    except json.JSONDecodeError as e:
        error = {"error": f"Invalid GeoJSON: {str(e)}"}
        logger.error(json.dumps(error))
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        error = {"error": f"Analysis error: {str(e)}"}
        logger.error(json.dumps(error))
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
