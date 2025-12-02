#!/usr/bin/env python3
# ABOUTME: Unit tests for fetch_pois_osm.py script.
# ABOUTME: Stubs HTTP requests to Overpass API for isolated testing.

import unittest
import json
import sys
from unittest.mock import patch, Mock
from io import StringIO

# Import will work once we create the module
import fetch_pois_osm


class TestFetchPOIsOSM(unittest.TestCase):

    def test_missing_arguments(self):
        """Should exit with error when arguments are missing"""
        with patch('sys.argv', ['fetch_pois_osm.py']):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    fetch_pois_osm.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)
                self.assertIn("Usage", error_output["error"])

    def test_invalid_json_arguments(self):
        """Should exit with error when JSON arguments are invalid"""
        with patch('sys.argv', ['fetch_pois_osm.py', 'not-valid-json']):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    fetch_pois_osm.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)

    @patch('fetch_pois_osm.requests.post')
    def test_successful_poi_fetch(self, mock_post):
        """Should return GeoJSON when Overpass API succeeds"""
        # Mock Overpass API response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "elements": [
                {
                    "type": "node",
                    "id": 123,
                    "lat": 47.6097,
                    "lon": -122.3331,
                    "tags": {
                        "amenity": "restaurant",
                        "name": "Pike Place Chowder"
                    }
                }
            ]
        }
        mock_post.return_value = mock_response

        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "radius_meters": 1000,
            "categories": ["restaurant", "cafe"]
        }

        with patch('sys.argv', ['fetch_pois_osm.py', json.dumps(args)]):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                with self.assertRaises(SystemExit) as cm:
                    fetch_pois_osm.main()

                self.assertEqual(cm.exception.code, 0)
                output = json.loads(mock_stdout.getvalue())

                # Verify GeoJSON structure
                self.assertEqual(output["type"], "FeatureCollection")
                self.assertIn("features", output)
                self.assertEqual(len(output["features"]), 1)

                # Verify feature structure
                feature = output["features"][0]
                self.assertEqual(feature["type"], "Feature")
                self.assertEqual(feature["geometry"]["type"], "Point")
                self.assertEqual(feature["geometry"]["coordinates"], [-122.3331, 47.6097])
                self.assertEqual(feature["properties"]["name"], "Pike Place Chowder")
                self.assertEqual(feature["properties"]["category"], "restaurant")

    @patch('fetch_pois_osm.requests.post')
    def test_overpass_api_failure(self, mock_post):
        """Should return error when Overpass API fails"""
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_post.return_value = mock_response

        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "radius_meters": 1000,
            "categories": ["restaurant"]
        }

        with patch('sys.argv', ['fetch_pois_osm.py', json.dumps(args)]):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    fetch_pois_osm.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)

    @patch('fetch_pois_osm.requests.post')
    def test_empty_results(self, mock_post):
        """Should return empty FeatureCollection when no POIs found"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"elements": []}
        mock_post.return_value = mock_response

        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "radius_meters": 1000,
            "categories": ["restaurant"]
        }

        with patch('sys.argv', ['fetch_pois_osm.py', json.dumps(args)]):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                with self.assertRaises(SystemExit) as cm:
                    fetch_pois_osm.main()

                self.assertEqual(cm.exception.code, 0)
                output = json.loads(mock_stdout.getvalue())
                self.assertEqual(output["type"], "FeatureCollection")
                self.assertEqual(len(output["features"]), 0)


if __name__ == "__main__":
    unittest.main()
