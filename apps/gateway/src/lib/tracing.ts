import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

let sdk: NodeSDK | null = null;

export function initTracing() {
  if (sdk) return;

  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  const serviceName = process.env.OTEL_SERVICE_NAME || "opendoor-gateway";
  const serviceVersion = process.env.OTEL_SERVICE_VERSION || "1.0.0";

  const spanProcessors = [];

  // Azure Monitor exporter if configured
  if (connectionString) {
    const azureExporter = new AzureMonitorTraceExporter({
      connectionString,
    });
    spanProcessors.push(new BatchSpanProcessor(azureExporter));
  }

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
      "deployment.environment": process.env.NODE_ENV || "development",
      "host.region": process.env.AZURE_REGION || "unknown",
    }),
    traceExporter: connectionString
      ? undefined
      : {
          export: (spans, resultCallback) => {
            for (const span of spans) {
              console.log(
                `[TRACE] ${span.name} - ${JSON.stringify(span.attributes)}`
              );
            }
            resultCallback({ code: 0 });
          },
          shutdown: () => Promise.resolve(),
        },
    spanProcessors: spanProcessors.length > 0 ? spanProcessors : undefined,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(
    `📊 OpenTelemetry tracing initialized (${connectionString ? "Azure Monitor" : "console"})`
  );

  // Graceful shutdown
  process.on("SIGTERM", () => {
    sdk?.shutdown().then(() => process.exit(0));
  });
}
