// ABOUTME: Extracts geographic features from tool results
// ABOUTME: Converts geocoding, isochrone, and OSM tool outputs into GeoFeature objects

import { randomUUID } from "crypto";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { IFeatureExtractor } from "./eventTransformer.js";
import type { GeoFeature, GeoJSONGeometryType } from "./types.js";

// Supported geometry types that we can render and persist
const SUPPORTED_GEOMETRY_TYPES = new Set(["Point", "LineString", "Polygon"]);

function isSupportedGeometry(
  geometry: unknown
): geometry is GeoJSONGeometryType {
  return (
    geometry !== null &&
    typeof geometry === "object" &&
    "type" in geometry &&
    typeof geometry.type === "string" &&
    SUPPORTED_GEOMETRY_TYPES.has(geometry.type)
  );
}

export class GeoFeatureExtractor implements IFeatureExtractor {
  extractFeatures(
    toolName: string,
    result: string,
    toolArguments: unknown
  ): GeoFeature[] {
    // Handle both MCP-prefixed names (mcp__geo-tools__geocode) and bare names
    if (toolName.includes("geocode")) {
      return this.extractGeocodeFeature(result, toolArguments);
    } else if (toolName.includes("calculate_distance")) {
      return this.extractDistanceFeatures(result, toolArguments);
    } else if (toolName.includes("generate_isochrone")) {
      return this.extractGeoJSONFeatures(result, "isochrone");
    } else if (toolName.includes("fetch_amenities")) {
      return this.extractGeoJSONFeatures(result, "amenity");
    } else if (toolName.includes("fetch_transit")) {
      return this.extractGeoJSONFeatures(result, "transit");
    } else if (toolName.includes("fetch_pois")) {
      return this.extractGeoJSONFeatures(result, "poi");
    } else if (toolName.includes("remove_feature")) {
      // no-op for remove_feature tool
      return [];
    }
    return [];
  }

  private extractGeocodeFeature(
    result: string,
    toolArguments: unknown
  ): GeoFeature[] {
    try {
      const geocodeResult = JSON.parse(result);
      const lat = parseFloat(geocodeResult.lat);
      // Handle both 'lng' (from geocode script) and 'lon' (internal format)
      const lon = parseFloat(geocodeResult.lng || geocodeResult.lon);

      // Type guard: check if toolArguments has location property
      const location =
        toolArguments &&
        typeof toolArguments === "object" &&
        "location" in toolArguments &&
        typeof toolArguments.location === "string"
          ? toolArguments.location
          : undefined;

      const label = geocodeResult.formatted_address || location || "Unknown";

      return [
        {
          id: randomUUID(),
          geometry: {
            type: "Point",
            coordinates: [lon, lat],
          },
          properties: { label },
        },
      ];
    } catch (e) {
      console.error("Failed to extract geocode feature:", e);
      return [];
    }
  }

  private extractDistanceFeatures(
    result: string,
    toolArguments: unknown
  ): GeoFeature[] {
    try {
      const distanceResult = JSON.parse(result);
      const features: GeoFeature[] = [];

      // Extract start point if coordinates provided
      if (distanceResult.start_lat && distanceResult.start_lon) {
        // Type guard: check if toolArguments has start_location property
        const startLocation =
          toolArguments &&
          typeof toolArguments === "object" &&
          "start_location" in toolArguments &&
          typeof toolArguments.start_location === "string"
            ? toolArguments.start_location
            : undefined;

        features.push({
          id: randomUUID(),
          geometry: {
            type: "Point",
            coordinates: [
              parseFloat(distanceResult.start_lon),
              parseFloat(distanceResult.start_lat),
            ],
          },
          properties: { label: startLocation || "Start" },
        });
      }

      // Extract end point if coordinates provided
      if (distanceResult.end_lat && distanceResult.end_lon) {
        // Type guard: check if toolArguments has end_location property
        const endLocation =
          toolArguments &&
          typeof toolArguments === "object" &&
          "end_location" in toolArguments &&
          typeof toolArguments.end_location === "string"
            ? toolArguments.end_location
            : undefined;

        features.push({
          id: randomUUID(),
          geometry: {
            type: "Point",
            coordinates: [
              parseFloat(distanceResult.end_lon),
              parseFloat(distanceResult.end_lat),
            ],
          },
          properties: { label: endLocation || "End" },
        });
      }

      return features;
    } catch (e) {
      console.error("Failed to extract distance features:", e);
      return [];
    }
  }

  private extractGeoJSONFeatures(
    result: string,
    featureCategory: string
  ): GeoFeature[] {
    try {
      const parsed = JSON.parse(result);

      // Handle GeoJSON FeatureCollection
      if (
        parsed.type === "FeatureCollection" &&
        Array.isArray(parsed.features)
      ) {
        const featureCollection = parsed as FeatureCollection<Geometry>;
        const { supported, skipped } = this.partitionByGeometrySupport(
          featureCollection.features
        );

        if (skipped.length > 0) {
          console.error(
            `Skipping ${
              skipped.length
            } feature(s) with unsupported geometry: ${skipped.join(", ")}`
          );
        }

        return supported.map((feature) =>
          this.convertGeoJSONFeature(feature, featureCategory)
        );
      }

      // Handle single GeoJSON Feature
      if (parsed.type === "Feature" && parsed.geometry) {
        if (!isSupportedGeometry(parsed.geometry)) {
          const geometryType =
            (parsed.geometry as { type?: string })?.type ?? "unknown";
          console.error(
            `Skipping feature with unsupported geometry: ${geometryType}`
          );
          return [];
        }
        const validatedFeature: Feature<GeoJSONGeometryType> = {
          type: "Feature",
          geometry: parsed.geometry,
          properties: parsed.properties,
        };
        return [this.convertGeoJSONFeature(validatedFeature, featureCategory)];
      }

      console.error(`Unexpected GeoJSON format: ${parsed.type}`);
      return [];
    } catch (e) {
      console.error(`Failed to extract ${featureCategory} features:`, e);
      return [];
    }
  }

  private partitionByGeometrySupport(features: Feature<Geometry>[]): {
    supported: Feature<GeoJSONGeometryType>[];
    skipped: string[];
  } {
    const supported: Feature<GeoJSONGeometryType>[] = [];
    const skipped: string[] = [];

    for (const feature of features) {
      if (isSupportedGeometry(feature.geometry)) {
        supported.push({ ...feature, geometry: feature.geometry });
      } else {
        const geometryType =
          (feature.geometry as { type?: string })?.type ?? "unknown";
        skipped.push(geometryType);
      }
    }

    return { supported, skipped };
  }

  private convertGeoJSONFeature(
    feature: Feature<GeoJSONGeometryType>,
    featureCategory: string
  ): GeoFeature {
    const props = feature.properties || {};

    // Build a label from available properties
    const label = this.buildLabel(props, featureCategory);

    return {
      id: randomUUID(),
      geometry: feature.geometry,
      properties: {
        ...props,
        label,
        featureCategory,
      },
    };
  }

  private buildLabel(
    props: Record<string, unknown>,
    featureCategory: string
  ): string {
    // Try common name fields first
    if (typeof props.name === "string" && props.name !== "Unnamed") {
      return props.name;
    }

    // For isochrones, build a descriptive label
    if (
      featureCategory === "isochrone" &&
      typeof props.time_minutes === "number"
    ) {
      return `${props.time_minutes} min walk`;
    }

    // For transit, include type
    if (
      featureCategory === "transit" &&
      typeof props.transit_type === "string"
    ) {
      const name = typeof props.name === "string" ? props.name : "";
      return name ? `${name} (${props.transit_type})` : props.transit_type;
    }

    // For amenities, include type
    if (
      featureCategory === "amenity" &&
      typeof props.amenity_type === "string"
    ) {
      const name = typeof props.name === "string" ? props.name : "";
      return name ? `${name} (${props.amenity_type})` : props.amenity_type;
    }

    // For POIs, include type
    if (featureCategory === "poi" && typeof props.poi_type === "string") {
      const name = typeof props.name === "string" ? props.name : "";
      return name ? `${name} (${props.poi_type})` : props.poi_type;
    }

    // Fallback
    return typeof props.name === "string" ? props.name : featureCategory;
  }
}
