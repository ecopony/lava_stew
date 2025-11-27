#!/usr/bin/env python3
# ABOUTME: Unit tests for analyze_location_data.py script.
# ABOUTME: Tests spatial analysis metrics using mock GeoJSON data.

import unittest
import json
from unittest.mock import patch
from io import StringIO

import analyze_location_data


class TestAnalyzeLocationData(unittest.TestCase):

    def setUp(self):
        """Create test GeoJSON data"""
        # POIs GeoJSON
        self.pois_data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-122.333, 47.610]},
                    "properties": {"category": "restaurant", "name": "Restaurant 1"}
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-122.335, 47.611]},
                    "properties": {"category": "restaurant", "name": "Restaurant 2"}
                },
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-122.332, 47.609]},
                    "properties": {"category": "cafe", "name": "Cafe 1"}
                }
            ]
        }

        # Transit GeoJSON
        self.transit_data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-122.334, 47.610]},
                    "properties": {"transit_type": "bus_stop", "name": "Stop 1"}
                }
            ]
        }

        # Amenities GeoJSON
        self.amenities_data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [-122.336, 47.612]},
                    "properties": {"amenity_type": "park", "name": "Park 1"}
                }
            ]
        }

        # Isochrones GeoJSON
        self.isochrones_data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"time_minutes": 5},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [-122.340, 47.615],
                            [-122.325, 47.615],
                            [-122.325, 47.605],
                            [-122.340, 47.605],
                            [-122.340, 47.615]
                        ]]
                    }
                },
                {
                    "type": "Feature",
                    "properties": {"time_minutes": 10},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [-122.345, 47.620],
                            [-122.320, 47.620],
                            [-122.320, 47.600],
                            [-122.345, 47.600],
                            [-122.345, 47.620]
                        ]]
                    }
                }
            ]
        }

    def test_missing_arguments(self):
        """Should exit with error when arguments are missing"""
        with patch('sys.argv', ['analyze_location_data.py']):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    analyze_location_data.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)

    def test_successful_analysis(self):
        """Should produce analysis metrics from GeoJSON inputs"""
        args = {
            "pois_geojson": json.dumps(self.pois_data),
            "transit_geojson": json.dumps(self.transit_data),
            "amenities_geojson": json.dumps(self.amenities_data),
            "isochrones_geojson": json.dumps(self.isochrones_data),
            "center_lat": 47.610,
            "center_lon": -122.333,
            "radius_meters": 1000
        }

        with patch('sys.argv', ['analyze_location_data.py', json.dumps(args)]):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                with self.assertRaises(SystemExit) as cm:
                    analyze_location_data.main()

                self.assertEqual(cm.exception.code, 0)
                output = json.loads(mock_stdout.getvalue())

                # Check structure
                self.assertIn("density", output)
                self.assertIn("walkability", output)
                self.assertIn("isochrone_coverage", output)
                self.assertIn("clusters", output)

                # Check density metrics
                self.assertIn("pois_per_sq_km", output["density"])
                self.assertIn("transit_stops_per_sq_km", output["density"])

                # Check isochrone coverage for each time interval
                self.assertIn("5min_walk", output["isochrone_coverage"])
                self.assertIn("10min_walk", output["isochrone_coverage"])

    def test_invalid_geojson(self):
        """Should handle invalid GeoJSON gracefully"""
        args = {
            "pois_geojson": "not valid json",
            "transit_geojson": json.dumps(self.transit_data),
            "amenities_geojson": json.dumps(self.amenities_data),
            "isochrones_geojson": json.dumps(self.isochrones_data),
            "center_lat": 47.610,
            "center_lon": -122.333,
            "radius_meters": 1000
        }

        with patch('sys.argv', ['analyze_location_data.py', json.dumps(args)]):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    analyze_location_data.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)


if __name__ == "__main__":
    unittest.main()
