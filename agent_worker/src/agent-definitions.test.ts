// ABOUTME: Unit tests for agent definition schemas and configuration.
// ABOUTME: Validates tools, prompts, and property structure for sub-agents.

import { describe, it, expect } from 'vitest';
import { agentDefinitions } from './agent-definitions.js';

describe('Agent Definitions', () => {
  describe('Schema Structure', () => {
    it('should have location-intelligence agent defined', () => {
      expect(agentDefinitions).toHaveProperty('location-intelligence');
    });

    it('should have correct model assignment for cost optimization', () => {
      expect(agentDefinitions['location-intelligence'].model).toBe('sonnet');
    });
  });

  describe('Location Intelligence Agent', () => {
    const agent = agentDefinitions['location-intelligence'];

    it('should have all required geospatial tools', () => {
      expect(agent.tools).toContain('mcp__geo-tools__geocode');
      expect(agent.tools).toContain('mcp__geo-tools__fetch_pois_osm');
      expect(agent.tools).toContain('mcp__geo-tools__fetch_transit_osm');
      expect(agent.tools).toContain('mcp__geo-tools__fetch_amenities_osm');
      expect(agent.tools).toContain('mcp__geo-tools__generate_isochrone');
      expect(agent.tools).toContain('mcp__geo-tools__analyze_location_data');
    });

    it('should have exactly 6 tools', () => {
      expect(agent.tools).toHaveLength(6);
    });

    it('should have workflow steps in prompt', () => {
      expect(agent.prompt).toContain('For each location you analyze');
      expect(agent.prompt).toContain('1. Geocode the location');
      expect(agent.prompt).toContain('2. Determine appropriate search radius');
      expect(agent.prompt).toContain('3. Gather data');
      expect(agent.prompt).toContain('4. Analyze the collected data');
      expect(agent.prompt).toContain('5. Interpret the metrics');
    });

    it('should specify radius guidelines', () => {
      expect(agent.prompt).toContain('500m for landmarks');
      expect(agent.prompt).toContain('1000m for neighborhoods');
    });

    it('should specify core POI categories', () => {
      expect(agent.prompt).toContain('restaurant');
      expect(agent.prompt).toContain('cafe');
      expect(agent.prompt).toContain('bar');
      expect(agent.prompt).toContain('shop');
    });

    it('should specify isochrone intervals', () => {
      expect(agent.prompt).toContain('[5, 10, 15] minute intervals');
    });

    it('should describe analysis tool usage', () => {
      expect(agent.prompt).toContain('analyze_location_data with ALL the GeoJSON strings you collected');
      expect(agent.prompt).toContain('pois_geojson, transit_geojson, amenities_geojson, isochrones_geojson');
    });

    it('should specify expected metrics', () => {
      expect(agent.prompt).toContain('density');
      expect(agent.prompt).toContain('walkability');
      expect(agent.prompt).toContain('isochrone_coverage');
      expect(agent.prompt).toContain('clusters');
      expect(agent.prompt).toContain('coverage');
    });

    it('should instruct to interpret metrics', () => {
      expect(agent.prompt).toContain('What makes this location special or unique?');
      expect(agent.prompt).toContain('How walkable is it?');
      expect(agent.prompt).toContain('What amenities are easily accessible?');
    });

    it('should have clear description for when to use', () => {
      expect(agent.description).toContain('when user asks about a specific location');
      expect(agent.description).toContain('characteristics or surroundings');
    });

    it('should mention parallel execution capability', () => {
      expect(agent.description).toContain('compare multiple locations');
      expect(agent.description).toContain('can be run in parallel');
    });

    it('should handle sparse data gracefully', () => {
      expect(agent.prompt).toContain('For residential areas, expect sparse data - this is normal');
    });

    it('should handle tool failures gracefully', () => {
      expect(agent.prompt).toContain('If tools fail with timeouts, note the failures and continue with available data');
    });

    it('should specify concise output', () => {
      expect(agent.prompt).toContain('Return a concise summary with specific numbers and insights');
    });

    it('should note features are already on map', () => {
      expect(agent.prompt).toContain('All features are already on');
      expect(agent.prompt).toContain('the map from the gathering phase');
    });
  });
});
