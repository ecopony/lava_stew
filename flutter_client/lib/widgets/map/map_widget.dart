// ABOUTME: Basic map widget using flutter_map
// ABOUTME: Displays an OpenStreetMap tile layer and geocoded location markers

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_map/flutter_map.dart';

import '../../bloc/map_bloc.dart';
import '../../bloc/map_event.dart';
import '../../bloc/map_state.dart';

class MapWidget extends StatelessWidget {
  const MapWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<MapBloc, MapState>(
      builder: (context, state) {
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
                    urlTemplate:
                        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.example.lava_stew',
                  ),
                  if (state.polygons.isNotEmpty)
                    PolygonLayer(polygons: state.polygons),
                  if (state.polylines.isNotEmpty)
                    PolylineLayer(polylines: state.polylines),
                  if (state.markers.isNotEmpty)
                    MarkerLayer(markers: state.markers),
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
}
