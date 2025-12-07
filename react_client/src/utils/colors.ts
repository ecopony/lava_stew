// ABOUTME: Color utilities for deck.gl feature rendering.
// ABOUTME: Converts category-based hex colors to RGBA arrays for GPU rendering.

// RGB values for each feature category (matching original hex colors)
export const CATEGORY_COLORS_RGBA: Record<string, [number, number, number]> = {
  isochrone: [37, 99, 235], // #2563eb
  transit: [220, 38, 38], // #dc2626
  amenity: [22, 163, 74], // #16a34a
  poi: [147, 51, 234], // #9333ea
  default: [59, 130, 246], // #3b82f6
};

export function getFeatureColorRGBA(
  properties: Record<string, unknown>
): [number, number, number, number] {
  const category =
    (properties.featureCategory as string | undefined) ?? "default";
  const rgb = CATEGORY_COLORS_RGBA[category] ?? CATEGORY_COLORS_RGBA.default;

  // Isochrones get variable opacity based on time
  if (category === "isochrone") {
    const minutes = (properties.time_minutes as number) ?? 10;
    // 5 min = 102, 10 min = 76, 15 min = 51 (out of 255)
    const alpha = Math.max(38, 128 - minutes * 5);
    return [...rgb, alpha];
  }

  return [...rgb, 180];
}
