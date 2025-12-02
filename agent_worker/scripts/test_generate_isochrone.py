#!/usr/bin/env python3
# ABOUTME: Unit tests for generate_isochrone.py script.
# ABOUTME: Stubs HTTP requests to OpenRouteService API for isolated testing.

import unittest
import json
from unittest.mock import patch, Mock
from io import StringIO

import generate_isochrone


class TestGenerateIsochrone(unittest.TestCase):

    def test_missing_arguments(self):
        """Should exit with error when arguments are missing"""
        with patch('sys.argv', ['generate_isochrone.py']):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    generate_isochrone.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)

    def test_missing_api_key(self):
        """Should exit with error when API key is not set"""
        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "time_intervals": [5, 10, 15]
        }

        with patch('sys.argv', ['generate_isochrone.py', json.dumps(args)]):
            with patch.dict('os.environ', {}, clear=True):
                with patch('sys.stderr', new=StringIO()) as mock_stderr:
                    with self.assertRaises(SystemExit) as cm:
                        generate_isochrone.main()

                    self.assertEqual(cm.exception.code, 1)
                    error_output = json.loads(mock_stderr.getvalue())
                    self.assertIn("OPENROUTESERVICE_API_KEY", error_output["error"])

    @patch('generate_isochrone.requests.post')
    @patch.dict('os.environ', {'OPENROUTESERVICE_API_KEY': 'test-key'})
    def test_successful_isochrone_generation(self, mock_post):
        """Should return GeoJSON with isochrone polygons"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "value": 300,
                        "center": [-122.3331, 47.6097]
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [-122.340, 47.615],
                            [-122.330, 47.615],
                            [-122.330, 47.605],
                            [-122.340, 47.605],
                            [-122.340, 47.615]
                        ]]
                    }
                },
                {
                    "type": "Feature",
                    "properties": {
                        "value": 600,
                        "center": [-122.3331, 47.6097]
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [-122.350, 47.625],
                            [-122.320, 47.625],
                            [-122.320, 47.595],
                            [-122.350, 47.595],
                            [-122.350, 47.625]
                        ]]
                    }
                }
            ]
        }
        mock_post.return_value = mock_response

        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "time_intervals": [5, 10]
        }

        with patch('sys.argv', ['generate_isochrone.py', json.dumps(args)]):
            with patch('sys.stdout', new=StringIO()) as mock_stdout:
                with self.assertRaises(SystemExit) as cm:
                    generate_isochrone.main()

                self.assertEqual(cm.exception.code, 0)
                output = json.loads(mock_stdout.getvalue())

                self.assertEqual(output["type"], "FeatureCollection")
                self.assertEqual(len(output["features"]), 2)

                # Check first isochrone (5 min)
                iso_5min = output["features"][0]
                self.assertEqual(iso_5min["properties"]["time_minutes"], 5)
                self.assertEqual(iso_5min["properties"]["mode"], "walking")
                self.assertEqual(iso_5min["geometry"]["type"], "Polygon")

                # Check second isochrone (10 min)
                iso_10min = output["features"][1]
                self.assertEqual(iso_10min["properties"]["time_minutes"], 10)

    @patch('generate_isochrone.requests.post')
    @patch.dict('os.environ', {'OPENROUTESERVICE_API_KEY': 'test-key'})
    def test_ors_api_failure(self, mock_post):
        """Should exit with error when OpenRouteService API fails"""
        mock_response = Mock()
        mock_response.status_code = 403
        mock_response.text = "API key invalid"
        mock_post.return_value = mock_response

        args = {
            "lat": 47.6097,
            "lon": -122.3331,
            "time_intervals": [5, 10]
        }

        with patch('sys.argv', ['generate_isochrone.py', json.dumps(args)]):
            with patch('sys.stderr', new=StringIO()) as mock_stderr:
                with self.assertRaises(SystemExit) as cm:
                    generate_isochrone.main()

                self.assertEqual(cm.exception.code, 1)
                error_output = json.loads(mock_stderr.getvalue())
                self.assertIn("error", error_output)


if __name__ == "__main__":
    unittest.main()
