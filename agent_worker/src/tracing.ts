// ABOUTME: OpenTelemetry tracing bootstrap for the agent worker.
// ABOUTME: Must be imported first so the SDK starts before other modules; exports spans via OTLP to Jaeger.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Endpoint comes from OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318).
// In docker-compose this points at the Jaeger OTLP receiver.
const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "agent-worker",
  }),
  traceExporter: new OTLPTraceExporter(),
});

sdk.start();
console.log("[WORKER] OpenTelemetry tracing started");

const shutdownTracing = () => {
  sdk
    .shutdown()
    .catch((err) => console.error("[WORKER] OTEL shutdown error:", err));
};

process.on("SIGTERM", shutdownTracing);
process.on("SIGINT", shutdownTracing);
