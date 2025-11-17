// ABOUTME: BLoC for managing map visualization state
// ABOUTME: Handles adding/removing geographic features and map operations

import 'package:bloc/bloc.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' hide MapEvent;
import 'package:latlong2/latlong.dart';

import 'map_event.dart';
import 'map_state.dart';

// Auto-frame thresholds
const double _singlePointThreshold = 0.0001; // ~11 meters at equator
const double _singlePointPadding = 0.02; // ~2km view for single points
const double _normalBoundsPadding = 0.25; // 25% padding for feature collections
const double _viewAdjustmentThreshold =
    0.3; // Adjust if new features extend >30% beyond current view
const double _minRangeForCalculation = 0.000001; // Prevent division by zero

class MapBloc extends Bloc<MapEvent, MapState> {
  MapBloc() : super(MapState()) {
    on<AddGeoFeature>(_onAddGeoFeature);
    on<RemoveGeoFeature>(_onRemoveGeoFeature);
    on<AddMarkers>(_onAddMarkers);
    on<AddPolylines>(_onAddPolylines);
    on<AddPolygons>(_onAddPolygons);
    on<ClearMap>(_onClearMap);
    on<ZoomIn>(_onZoomIn);
    on<ZoomOut>(_onZoomOut);
    on<SetZoom>(_onSetZoom);
    on<UpdateMapPosition>(_onUpdateMapPosition);
    on<DisableAutoFrame>(_onDisableAutoFrame);
    on<EnableAutoFrame>(_onEnableAutoFrame);
  }

  void _onAddGeoFeature(AddGeoFeature event, Emitter<MapState> emit) {
    final marker = Marker(
      key: ValueKey(event.feature.id),
      point: LatLng(event.feature.lat, event.feature.lon),
      width: 80,
      height: 80,
      child: const Icon(
        Icons.location_on,
        color: Colors.red,
        size: 40,
      ),
    );

    final updatedMarkers = [...state.markers, marker];
    final allPoints = updatedMarkers.map((m) => m.point).toList();
    final newPoints = [marker.point];

    _handleAutoFrame(
      emit: emit,
      hasNewFeatures: true,
      allPoints: allPoints,
      newPoints: newPoints,
      updateState: (conversationBounds, camera) => state.copyWith(
        markers: updatedMarkers,
        conversationBounds: conversationBounds,
        center: camera?.center ?? state.center,
        zoom: camera?.zoom ?? state.zoom,
      ),
      fallbackState: state.copyWith(
        markers: updatedMarkers,
      ),
    );
  }

  void _onRemoveGeoFeature(RemoveGeoFeature event, Emitter<MapState> emit) {
    final updatedMarkers =
        state.markers.where((m) => m.key != ValueKey(event.featureId)).toList();

    emit(state.copyWith(markers: updatedMarkers));
  }

  void _onAddMarkers(AddMarkers event, Emitter<MapState> emit) {
    final updatedMarkers = [...state.markers, ...event.markers];
    final allPoints = updatedMarkers.map((m) => m.point).toList();
    final newPoints = event.markers.map((m) => m.point).toList();

    _handleAutoFrame(
      emit: emit,
      hasNewFeatures: event.markers.isNotEmpty,
      allPoints: allPoints,
      newPoints: newPoints,
      updateState: (conversationBounds, camera) => state.copyWith(
        markers: updatedMarkers,
        conversationBounds: conversationBounds,
        center: camera?.center ?? state.center,
        zoom: camera?.zoom ?? state.zoom,
      ),
      fallbackState: state.copyWith(markers: updatedMarkers),
    );
  }

  void _onAddPolylines(AddPolylines event, Emitter<MapState> emit) {
    final updatedPolylines = [...state.polylines, ...event.polylines];
    final allPoints = updatedPolylines.expand((p) => p.points).toList();
    final newPoints = event.polylines.expand((p) => p.points).toList();

    _handleAutoFrame(
      emit: emit,
      hasNewFeatures: event.polylines.isNotEmpty,
      allPoints: allPoints,
      newPoints: newPoints,
      updateState: (conversationBounds, camera) => state.copyWith(
        polylines: updatedPolylines,
        conversationBounds: conversationBounds,
        center: camera?.center ?? state.center,
        zoom: camera?.zoom ?? state.zoom,
      ),
      fallbackState: state.copyWith(polylines: updatedPolylines),
    );
  }

  void _onAddPolygons(AddPolygons event, Emitter<MapState> emit) {
    final updatedPolygons = [...state.polygons, ...event.polygons];
    final allPoints = updatedPolygons.expand((p) => p.points).toList();
    final newPoints = event.polygons.expand((p) => p.points).toList();

    _handleAutoFrame(
      emit: emit,
      hasNewFeatures: event.polygons.isNotEmpty,
      allPoints: allPoints,
      newPoints: newPoints,
      updateState: (conversationBounds, camera) => state.copyWith(
        polygons: updatedPolygons,
        conversationBounds: conversationBounds,
        center: camera?.center ?? state.center,
        zoom: camera?.zoom ?? state.zoom,
      ),
      fallbackState: state.copyWith(polygons: updatedPolygons),
    );
  }

  void _handleAutoFrame({
    required Emitter<MapState> emit,
    required bool hasNewFeatures,
    required List<LatLng> allPoints,
    required List<LatLng> newPoints,
    required MapState Function(LatLngBounds?, MapCamera?) updateState,
    required MapState fallbackState,
  }) {
    if (!state.autoFrameEnabled || !hasNewFeatures) {
      emit(fallbackState);
      return;
    }

    final allBounds = _calculateBoundsFromPoints(allPoints);
    final newBounds = _calculateBoundsFromPoints(newPoints);

    if (allBounds == null || newBounds == null) {
      emit(fallbackState);
      return;
    }

    // Adjust camera if: (1) first features in conversation, or (2) new features significantly outside current view
    MapCamera? camera;
    if (state.conversationBounds == null) {
      camera = _fitBounds(allBounds);
    } else if (_shouldAdjustView(newBounds)) {
      camera = _fitBounds(allBounds);
    }

    emit(updateState(allBounds, camera));
  }

  void _onClearMap(ClearMap event, Emitter<MapState> emit) {
    emit(MapState());
  }

  void _onZoomIn(ZoomIn event, Emitter<MapState> emit) {
    final newZoom = state.zoom + 1.0;
    try {
      state.mapController.move(state.center, newZoom);
    } catch (e) {
      // Map controller may not be ready yet; state will be applied when widget renders
    }
    emit(state.copyWith(
      zoom: newZoom,
      autoFrameEnabled: false,
    ));
  }

  void _onZoomOut(ZoomOut event, Emitter<MapState> emit) {
    final newZoom = state.zoom - 1.0;
    try {
      state.mapController.move(state.center, newZoom);
    } catch (e) {
      // Map controller may not be ready yet; state will be applied when widget renders
    }
    emit(state.copyWith(
      zoom: newZoom,
      autoFrameEnabled: false,
    ));
  }

  void _onSetZoom(SetZoom event, Emitter<MapState> emit) {
    try {
      state.mapController.move(state.center, event.zoom);
    } catch (e) {
      // Map controller may not be ready yet; state will be applied when widget renders
    }
    emit(state.copyWith(zoom: event.zoom));
  }

  void _onUpdateMapPosition(UpdateMapPosition event, Emitter<MapState> emit) {
    emit(state.copyWith(
      center: event.center,
      zoom: event.zoom,
    ));
  }

  List<LatLng> _getAllPointsFromState() {
    return [
      ...state.markers.map((m) => m.point),
      ...state.polylines.expand((p) => p.points),
      ...state.polygons.expand((p) => p.points),
    ].toList();
  }

  LatLngBounds? _calculateBoundsFromPoints(List<LatLng> points) {
    if (points.isEmpty) return null;

    double minLat = points.first.latitude;
    double maxLat = points.first.latitude;
    double minLng = points.first.longitude;
    double maxLng = points.first.longitude;

    for (var point in points) {
      minLat = minLat < point.latitude ? minLat : point.latitude;
      maxLat = maxLat > point.latitude ? maxLat : point.latitude;
      minLng = minLng < point.longitude ? minLng : point.longitude;
      maxLng = maxLng > point.longitude ? maxLng : point.longitude;
    }

    return LatLngBounds(
      LatLng(minLat, minLng),
      LatLng(maxLat, maxLng),
    );
  }

  bool _shouldAdjustView(LatLngBounds newFeatureBounds) {
    if (state.conversationBounds == null) return true;

    final currentBounds = state.conversationBounds!;

    // Calculate how much of the new features are outside current bounds
    final newSW = newFeatureBounds.southWest;
    final newNE = newFeatureBounds.northEast;
    final currSW = currentBounds.southWest;
    final currNE = currentBounds.northEast;

    // If new bounds are significantly outside current bounds, adjust
    final latRange = currNE.latitude - currSW.latitude;
    final lngRange = currNE.longitude - currSW.longitude;

    // Guard against division by zero for very small or zero ranges
    // If current view is essentially a point, always adjust when new features are added
    if (latRange.abs() < _minRangeForCalculation ||
        lngRange.abs() < _minRangeForCalculation) {
      return true;
    }

    final latOutside = (newSW.latitude < currSW.latitude
            ? currSW.latitude - newSW.latitude
            : 0) +
        (newNE.latitude > currNE.latitude
            ? newNE.latitude - currNE.latitude
            : 0);
    final lngOutside = (newSW.longitude < currSW.longitude
            ? currSW.longitude - newSW.longitude
            : 0) +
        (newNE.longitude > currNE.longitude
            ? newNE.longitude - currNE.longitude
            : 0);

    // Adjust if new features extend beyond threshold of current view in any direction
    return (latOutside / latRange > _viewAdjustmentThreshold) ||
        (lngOutside / lngRange > _viewAdjustmentThreshold);
  }

  MapCamera? _fitBounds(LatLngBounds bounds) {
    try {
      final latRange = bounds.northEast.latitude - bounds.southWest.latitude;
      final lngRange = bounds.northEast.longitude - bounds.southWest.longitude;

      LatLngBounds paddedBounds;

      if (latRange < _singlePointThreshold &&
          lngRange < _singlePointThreshold) {
        // Single point or very tight cluster - create fixed bounds around it
        final center = LatLng(
          (bounds.northEast.latitude + bounds.southWest.latitude) / 2,
          (bounds.northEast.longitude + bounds.southWest.longitude) / 2,
        );
        paddedBounds = LatLngBounds(
          LatLng(center.latitude - _singlePointPadding,
              center.longitude - _singlePointPadding),
          LatLng(center.latitude + _singlePointPadding,
              center.longitude + _singlePointPadding),
        );
      } else {
        // Normal case - add padding for better visibility
        final latPadding = latRange * _normalBoundsPadding;
        final lngPadding = lngRange * _normalBoundsPadding;

        paddedBounds = LatLngBounds(
          LatLng(bounds.southWest.latitude - latPadding,
              bounds.southWest.longitude - lngPadding),
          LatLng(bounds.northEast.latitude + latPadding,
              bounds.northEast.longitude + lngPadding),
        );
      }

      // Fit camera to the bounds
      state.mapController.fitCamera(
        CameraFit.bounds(bounds: paddedBounds),
      );

      return state.mapController.camera;
    } catch (e) {
      // Map controller may not be ready yet; auto-frame will retry on next feature add
      return null;
    }
  }

  void _onDisableAutoFrame(DisableAutoFrame event, Emitter<MapState> emit) {
    emit(state.copyWith(autoFrameEnabled: false));
  }

  void _onEnableAutoFrame(EnableAutoFrame event, Emitter<MapState> emit) {
    // Recalculate bounds from all current features
    final allPoints = _getAllPointsFromState();
    final conversationBounds = _calculateBoundsFromPoints(allPoints);
    MapCamera? camera;
    if (conversationBounds != null) {
      camera = _fitBounds(conversationBounds);
    }

    emit(state.copyWith(
      autoFrameEnabled: true,
      conversationBounds: conversationBounds,
      center: camera?.center ?? state.center,
      zoom: camera?.zoom ?? state.zoom,
    ));
  }
}
