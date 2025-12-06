// ABOUTME: Map widget using flutter_map with GeoJSON feature rendering.
// ABOUTME: Displays geographic features (points, lines, polygons) with category-based styling.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../bloc/map_bloc.dart';
import '../../bloc/map_event.dart';
import '../../bloc/map_state.dart';
import '../../models/geo_feature.dart';

// Color palette for different feature categories
const Map<String, Color> _categoryColors = {
  'isochrone': Color(0xFF2563EB), // blue
  'transit': Color(0xFFDC2626), // red
  'amenity': Color(0xFF16A34A), // green
  'poi': Color(0xFF9333EA), // purple
  'default': Color(0xFF3B82F6), // blue
};

Color _getFeatureColor(GeoFeature feature) {
  final category = feature.properties.featureCategory;
  return _categoryColors[category] ?? _categoryColors['default']!;
}

// Isochrone opacity varies by time (larger = more transparent)
double _getIsochroneOpacity(GeoFeature feature) {
  final timeMinutes = feature.properties['time_minutes'];
  if (timeMinutes is! num) return 0.3;
  // 5 min = 0.4, 10 min = 0.3, 15 min = 0.2
  return (0.5 - timeMinutes * 0.02).clamp(0.15, 0.5);
}

class MapWidget extends StatelessWidget {
  const MapWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<MapBloc, MapState>(
      builder: (context, state) {
        // Build geometry layers from features
        final markers = <Marker>[];
        final polylines = <Polyline>[];
        final polygons = <Polygon>[];

        for (final feature in state.features) {
          _buildGeometry(feature, markers, polylines, polygons);
        }

        return Stack(
          children: [
            FlutterMap(
              mapController: state.mapController,
              options: MapOptions(
                initialCenter: state.center,
                initialZoom: state.zoom,
                onPositionChanged: (position, hasGesture) {
                  if (hasGesture) {
                    context.read<MapBloc>().add(
                          UpdateMapPosition(position.center, position.zoom),
                        );
                    // Disable auto-frame when user manually interacts
                    if (state.autoFrameEnabled) {
                      context.read<MapBloc>().add(DisableAutoFrame());
                    }
                  }
                },
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.example.lava_stew',
                ),
                if (polygons.isNotEmpty) PolygonLayer(polygons: polygons),
                if (polylines.isNotEmpty) PolylineLayer(polylines: polylines),
                if (markers.isNotEmpty) MarkerLayer(markers: markers),
              ],
            ),
            Positioned(
              right: 10,
              top: 10,
              child: Column(
                children: [
                  FloatingActionButton(
                    mini: true,
                    onPressed: () => context.read<MapBloc>().add(ZoomIn()),
                    child: const Icon(Icons.add),
                  ),
                  const SizedBox(height: 8),
                  FloatingActionButton(
                    mini: true,
                    onPressed: () => context.read<MapBloc>().add(ZoomOut()),
                    child: const Icon(Icons.remove),
                  ),
                  if (!state.autoFrameEnabled) ...[
                    const SizedBox(height: 8),
                    FloatingActionButton(
                      mini: true,
                      onPressed: () =>
                          context.read<MapBloc>().add(EnableAutoFrame()),
                      tooltip: 'Re-enable auto-frame',
                      child: const Icon(Icons.center_focus_strong),
                    ),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  void _buildGeometry(
    GeoFeature feature,
    List<Marker> markers,
    List<Polyline> polylines,
    List<Polygon> polygons,
  ) {
    final geometry = feature.geometry;
    final color = _getFeatureColor(feature);
    final label = feature.properties.label;

    switch (geometry) {
      case GeoJSONPoint():
        markers.add(
          Marker(
            key: ValueKey(feature.id),
            point: LatLng(geometry.latitude, geometry.longitude),
            width: 24,
            height: 24,
            child: Container(
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.3),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: label != null
                  ? Tooltip(message: label, child: const SizedBox.expand())
                  : null,
            ),
          ),
        );

      case GeoJSONLineString():
        polylines.add(
          Polyline(
            points: geometry.coordinates
                .map((coord) => LatLng(coord[1], coord[0]))
                .toList(),
            color: color,
            strokeWidth: 3,
          ),
        );

      case GeoJSONPolygon():
        final isIsochrone = feature.properties.featureCategory == 'isochrone';
        final fillOpacity = isIsochrone ? _getIsochroneOpacity(feature) : 0.3;

        // Convert all rings (exterior + holes)
        final points = geometry.coordinates.isNotEmpty
            ? geometry.coordinates[0]
                .map((coord) => LatLng(coord[1], coord[0]))
                .toList()
            : <LatLng>[];

        final holePoints = geometry.coordinates.length > 1
            ? geometry.coordinates
                .skip(1)
                .map((ring) =>
                    ring.map((coord) => LatLng(coord[1], coord[0])).toList())
                .toList()
            : <List<LatLng>>[];

        polygons.add(
          Polygon(
            points: points,
            holePointsList: holePoints,
            color: color.withValues(alpha: fillOpacity),
            borderColor: color,
            borderStrokeWidth: 2,
          ),
        );
    }
  }
}
