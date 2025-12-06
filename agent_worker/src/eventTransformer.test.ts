// ABOUTME: Unit tests for SDK event transformation to domain events
// ABOUTME: Tests sub-agent detection, tool event emission, and error handling

import { describe, it, expect, vi } from 'vitest';
import { transformToAgentEvents } from './eventTransformer.js';

// Mock feature extractor
const mockFeatureExtractor = {
  extractFeatures: vi.fn(() => []),
};

describe('transformToAgentEvents', () => {
  it('should emit assistant_thinking on first assistant message', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello' }],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      []
    )) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: 'assistant_thinking' });
  });

  it('should emit assistant_message_chunk for text content', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello world' }],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      []
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'assistant_message_chunk',
      chunk: 'Hello world',
    });
  });

  it('should emit tool_start for regular tool use', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-123',
              name: 'geocode',
              input: { location: 'Seattle' },
            },
          ],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      []
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'tool_start',
      toolId: 'tool-123',
      toolName: 'geocode',
      input: { location: 'Seattle' },
    });
  });

  it('should emit subagent_started for known sub-agent', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'task-456',
              name: 'Task',
              input: {
                subagent_type: 'data-gatherer',
                prompt: 'Gather data',
              },
            },
          ],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      ['data-gatherer', 'analyzer']
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'subagent_started',
      toolId: 'task-456',
      agentName: 'data-gatherer',
    });
  });

  it('should emit tool_start for unknown sub-agent type', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const sdkStream = (async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'task-456',
              name: 'Task',
              input: {
                subagent_type: 'unknown-agent',
                prompt: 'Do something',
              },
            },
          ],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      ['data-gatherer', 'analyzer']
    )) {
      events.push(event);
    }

    // Should emit warning
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown sub-agent type: unknown-agent')
    );

    // Should emit as regular tool instead
    expect(events).toContainEqual({
      type: 'tool_start',
      toolId: 'task-456',
      toolName: 'Task',
      input: {
        subagent_type: 'unknown-agent',
        prompt: 'Do something',
      },
    });

    consoleSpy.mockRestore();
  });

  it('should emit subagent_completed when sub-agent finishes', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'task-789',
              name: 'Task',
              input: {
                subagent_type: 'analyzer',
                prompt: 'Analyze',
              },
            },
          ],
        },
      };
      yield {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'task-789',
              content: [{ type: 'text', text: 'Analysis complete' }],
            },
          ],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      ['analyzer']
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'subagent_completed',
      toolId: 'task-789',
      agentName: 'analyzer',
      result: 'Analysis complete',
      error: undefined,
    });
  });

  it('should emit subagent_completed with error on failure', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'task-999',
              name: 'Task',
              input: {
                subagent_type: 'analyzer',
                prompt: 'Analyze',
              },
            },
          ],
        },
      };
      yield {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'task-999',
              content: [{ type: 'text', text: 'Failed to analyze' }],
              is_error: true,
            },
          ],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      ['analyzer']
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'subagent_completed',
      toolId: 'task-999',
      agentName: 'analyzer',
      result: 'Failed to analyze',
      error: 'Failed to analyze',
    });
  });

  it('should emit tool_result for regular tool completion', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-abc',
              name: 'geocode',
              input: { location: 'Portland' },
            },
          ],
        },
      };
      yield {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-abc',
              content: [
                {
                  type: 'text',
                  text: '{"lat": 45.5152, "lng": -122.6784}',
                },
              ],
            },
          ],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      []
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'tool_result',
      toolId: 'tool-abc',
      toolName: 'geocode',
      result: { lat: 45.5152, lng: -122.6784 },
      error: undefined,
    });
  });

  it('should skip system events', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'system',
        message: 'System initialization',
      };
      yield {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello' }],
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      []
    )) {
      events.push(event);
    }

    // Should not emit any system events
    expect(events.filter((e) => e.type === 'system')).toHaveLength(0);
    expect(events[0].type).toBe('assistant_thinking');
  });

  it('should emit error event for SDK errors', async () => {
    const sdkStream = (async function* () {
      yield {
        type: 'error',
        error: {
          message: 'API rate limit exceeded',
        },
      };
    })();

    const events = [];
    for await (const event of transformToAgentEvents(
      sdkStream,
      mockFeatureExtractor,
      []
    )) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'error',
      errorType: 'api_error',
      message: 'API rate limit exceeded',
    });
  });

  describe('Sub-agent Pipeline Logging', () => {
    it('should log pipeline start, individual stages, and completion', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const sdkStream = (async function* () {
        // First sub-agent starts
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'task-1',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-data-gatherer',
                  prompt: 'Gather data',
                },
              },
            ],
          },
        };

        // First sub-agent completes
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-1',
                content: [{ type: 'text', text: 'Data gathered' }],
              },
            ],
          },
        };

        // Second sub-agent starts
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'task-2',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-analyzer',
                  prompt: 'Analyze data',
                },
              },
            ],
          },
        };

        // Second sub-agent completes
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-2',
                content: [{ type: 'text', text: 'Analysis complete' }],
              },
            ],
          },
        };

        // Third sub-agent starts
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'task-3',
                name: 'Task',
                input: {
                  subagent_type: 'location-reporter',
                  prompt: 'Create report',
                },
              },
            ],
          },
        };

        // Third sub-agent completes
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-3',
                content: [{ type: 'text', text: 'Report created' }],
              },
            ],
          },
        };
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer', 'geospatial-analyzer', 'location-reporter'],
        undefined,
        'test-conversation-123'
      )) {
        events.push(event);
      }

      // Verify pipeline start log
      expect(consoleSpy).toHaveBeenCalledWith(
        '[WORKER] Sub-agent pipeline started for conversation: test-conversation-123'
      );

      // Verify individual stage completion logs
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[WORKER\] Sub-agent completed: geospatial-data-gatherer \(\d+\.\d+s\)/
        )
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[WORKER\] Sub-agent completed: geospatial-analyzer \(\d+\.\d+s\)/
        )
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[WORKER\] Sub-agent completed: location-reporter \(\d+\.\d+s\)/
        )
      );

      // Verify pipeline completion log with agent chain
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[WORKER\] Sub-agent pipeline completed: geospatial-data-gatherer → geospatial-analyzer → location-reporter \(total: \d+\.\d+s\)/
        )
      );

      consoleSpy.mockRestore();
    });

    it('should log pipeline without conversationId when not provided', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const sdkStream = (async function* () {
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'task-1',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-data-gatherer',
                  prompt: 'Gather data',
                },
              },
            ],
          },
        };

        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-1',
                content: [{ type: 'text', text: 'Data gathered' }],
              },
            ],
          },
        };
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer']
      )) {
        events.push(event);
      }

      // Should log without conversationId
      expect(consoleSpy).toHaveBeenCalledWith(
        '[WORKER] Sub-agent pipeline started'
      );

      consoleSpy.mockRestore();
    });

    it('should not log pipeline summary if no sub-agents completed', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const sdkStream = (async function* () {
        // Sub-agent starts but never completes
        yield {
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'task-1',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-data-gatherer',
                  prompt: 'Gather data',
                },
              },
            ],
          },
        };
        // No completion event
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer']
      )) {
        events.push(event);
      }

      // Should have pipeline start log
      expect(consoleSpy).toHaveBeenCalledWith(
        '[WORKER] Sub-agent pipeline started'
      );

      // Should NOT have pipeline completed log
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/Sub-agent pipeline completed/)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Sub-agent Usage Tracking', () => {
    it('should track usage for each sub-agent', async () => {
      const usageCallback = vi.fn();

      const sdkStream = (async function* () {
        // Sub-agent starts
        yield {
          type: 'assistant',
          message: {
            id: 'msg-1',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            content: [
              {
                type: 'tool_use',
                id: 'task-1',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-data-gatherer',
                  prompt: 'Gather data',
                },
              },
            ],
          },
        };

        // Sub-agent completes
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-1',
                content: [{ type: 'text', text: 'Data gathered' }],
              },
            ],
          },
        };
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer'],
        undefined,
        'test-conv-123',
        usageCallback
      )) {
        events.push(event);
      }

      // Verify usage callback was called with agent name and usage
      expect(usageCallback).toHaveBeenCalledWith('geospatial-data-gatherer', {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      });
    });

    it('should deduplicate usage by message ID', async () => {
      const usageCallback = vi.fn();

      const sdkStream = (async function* () {
        // Multiple messages with same ID (parallel tool uses)
        yield {
          type: 'assistant',
          message: {
            id: 'msg-same',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            content: [
              {
                type: 'tool_use',
                id: 'task-1',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-data-gatherer',
                  prompt: 'Gather data',
                },
              },
            ],
          },
        };

        // Same message ID - should be ignored
        yield {
          type: 'assistant',
          message: {
            id: 'msg-same',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            content: [{ type: 'text', text: 'Same message' }],
          },
        };

        // Complete the sub-agent
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-1',
                content: [{ type: 'text', text: 'Done' }],
              },
            ],
          },
        };
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer'],
        undefined,
        undefined,
        usageCallback
      )) {
        events.push(event);
      }

      // Should only be called once despite duplicate message ID
      expect(usageCallback).toHaveBeenCalledTimes(1);
    });

    it('should track usage for multiple sub-agents separately', async () => {
      const usageCallback = vi.fn();

      const sdkStream = (async function* () {
        // First sub-agent
        yield {
          type: 'assistant',
          message: {
            id: 'msg-1',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            content: [
              {
                type: 'tool_use',
                id: 'task-1',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-data-gatherer',
                  prompt: 'Gather',
                },
              },
            ],
          },
        };

        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-1',
                content: [{ type: 'text', text: 'Done' }],
              },
            ],
          },
        };

        // Second sub-agent
        yield {
          type: 'assistant',
          message: {
            id: 'msg-2',
            usage: {
              input_tokens: 200,
              output_tokens: 75,
              cache_read_input_tokens: 10,
              cache_creation_input_tokens: 0,
            },
            content: [
              {
                type: 'tool_use',
                id: 'task-2',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-analyzer',
                  prompt: 'Analyze',
                },
              },
            ],
          },
        };

        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-2',
                content: [{ type: 'text', text: 'Done' }],
              },
            ],
          },
        };
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer', 'geospatial-analyzer'],
        undefined,
        undefined,
        usageCallback
      )) {
        events.push(event);
      }

      // Should be called twice with different agents
      expect(usageCallback).toHaveBeenCalledTimes(2);
      expect(usageCallback).toHaveBeenNthCalledWith(
        1,
        'geospatial-data-gatherer',
        {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }
      );
      expect(usageCallback).toHaveBeenNthCalledWith(2, 'geospatial-analyzer', {
        input_tokens: 200,
        output_tokens: 75,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 0,
      });
    });

    it('should track multiple usage steps within a single sub-agent execution', async () => {
      const usageCallback = vi.fn();

      const sdkStream = (async function* () {
        // Sub-agent starts
        yield {
          type: 'assistant',
          message: {
            id: 'msg-step-1',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            content: [
              {
                type: 'tool_use',
                id: 'task-1',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-data-gatherer',
                  prompt: 'Gather data',
                },
              },
            ],
          },
        };

        // Sub-agent makes a tool call (still executing, new message ID = new step)
        yield {
          type: 'assistant',
          message: {
            id: 'msg-step-2',
            usage: {
              input_tokens: 150,
              output_tokens: 75,
              cache_read_input_tokens: 100,
              cache_creation_input_tokens: 0,
            },
            content: [
              {
                type: 'tool_use',
                id: 'geocode-1',
                name: 'geocode',
                input: { location: 'Seattle' },
              },
            ],
          },
        };

        // Tool result
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'geocode-1',
                content: [{ type: 'text', text: '{"lat": 47.6, "lng": -122.3}' }],
              },
            ],
          },
        };

        // Sub-agent thinks again (new message ID = another step)
        yield {
          type: 'assistant',
          message: {
            id: 'msg-step-3',
            usage: {
              input_tokens: 200,
              output_tokens: 100,
              cache_read_input_tokens: 250,
              cache_creation_input_tokens: 0,
            },
            content: [{ type: 'text', text: 'Processing results...' }],
          },
        };

        // Sub-agent completes
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-1',
                content: [{ type: 'text', text: 'Data gathered successfully' }],
              },
            ],
          },
        };
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer'],
        undefined,
        undefined,
        usageCallback
      )) {
        events.push(event);
      }

      // Should be called THREE times for the three steps (msg-step-1, msg-step-2, msg-step-3)
      expect(usageCallback).toHaveBeenCalledTimes(3);

      expect(usageCallback).toHaveBeenNthCalledWith(
        1,
        'geospatial-data-gatherer',
        {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }
      );

      expect(usageCallback).toHaveBeenNthCalledWith(
        2,
        'geospatial-data-gatherer',
        {
          input_tokens: 150,
          output_tokens: 75,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 0,
        }
      );

      expect(usageCallback).toHaveBeenNthCalledWith(
        3,
        'geospatial-data-gatherer',
        {
          input_tokens: 200,
          output_tokens: 100,
          cache_read_input_tokens: 250,
          cache_creation_input_tokens: 0,
        }
      );
    });
  });

  describe('Orchestrator Usage Tracking', () => {
    it('should track orchestrator usage when not inside a sub-agent', async () => {
      const subagentUsageCallback = vi.fn();
      const orchestratorUsageCallback = vi.fn();

      const sdkStream = (async function* () {
        // Orchestrator analyzes message and decides to use tool (no sub-agent)
        yield {
          type: 'assistant',
          message: {
            id: 'msg-orchestrator-1',
            usage: {
              input_tokens: 500,
              output_tokens: 100,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 1000,
            },
            content: [
              {
                type: 'text',
                text: 'I will analyze this location for you.',
              },
            ],
          },
        };
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer'],
        undefined,
        'test-conv-123',
        subagentUsageCallback,
        orchestratorUsageCallback
      )) {
        events.push(event);
      }

      // Orchestrator usage callback should be called
      expect(orchestratorUsageCallback).toHaveBeenCalledTimes(1);
      expect(orchestratorUsageCallback).toHaveBeenCalledWith({
        input_tokens: 500,
        output_tokens: 100,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 1000,
      });

      // Sub-agent callback should NOT be called
      expect(subagentUsageCallback).not.toHaveBeenCalled();
    });

    it('should not call orchestrator callback when inside a sub-agent', async () => {
      const subagentUsageCallback = vi.fn();
      const orchestratorUsageCallback = vi.fn();

      const sdkStream = (async function* () {
        // Sub-agent starts
        yield {
          type: 'assistant',
          message: {
            id: 'msg-1',
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
            content: [
              {
                type: 'tool_use',
                id: 'task-1',
                name: 'Task',
                input: {
                  subagent_type: 'geospatial-data-gatherer',
                  prompt: 'Gather data',
                },
              },
            ],
          },
        };

        // Sub-agent completes
        yield {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'task-1',
                content: [{ type: 'text', text: 'Data gathered' }],
              },
            ],
          },
        };
      })();

      const events = [];
      for await (const event of transformToAgentEvents(
        sdkStream,
        mockFeatureExtractor,
        ['geospatial-data-gatherer'],
        undefined,
        'test-conv-123',
        subagentUsageCallback,
        orchestratorUsageCallback
      )) {
        events.push(event);
      }

      // Sub-agent callback should be called
      expect(subagentUsageCallback).toHaveBeenCalledTimes(1);
      expect(subagentUsageCallback).toHaveBeenCalledWith('geospatial-data-gatherer', {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      });

      // Orchestrator callback should NOT be called (we're inside sub-agent)
      expect(orchestratorUsageCallback).not.toHaveBeenCalled();
    });
  });
});
