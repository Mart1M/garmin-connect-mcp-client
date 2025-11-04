#!/usr/bin/env node

/**
 * Garmin Connect MCP Client
 *
 * MCP Server that consumes the Garmin Connect HTTP API
 * API URL: https://fgggkckgk8osog4osgg4484k.mart1m.fr
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import https from "https";

const API_BASE_URL =
  process.env.GARMIN_API_URL || "https://fgggkckgk8osog4osgg4484k.mart1m.fr";
const API_KEY = process.env.API_KEY || "";

// Get Garmin credentials from environment
const getGarminCredentials = () => {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "GARMIN_EMAIL and GARMIN_PASSWORD environment variables are required"
    );
  }

  return { email, password };
};

// Make HTTP request to the API
const apiRequest = async (method, endpoint, body = null) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const credentials = getGarminCredentials();

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        "Content-Type": "application/json",
        "X-Garmin-Email": credentials.email,
        "X-Garmin-Password": credentials.password,
      },
    };

    if (API_KEY) {
      options.headers["X-API-Key"] = API_KEY;
    }

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(
              new Error(
                `API Error (${res.statusCode}): ${JSON.stringify(parsed)}`
              )
            );
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
};

const server = new Server(
  {
    name: "garmin-connect-mcp-client",
    version: "0.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define all available tools
const tools = [
  // Workout Tools
  {
    name: "upload_workout",
    description: "Upload a workout to Garmin Connect",
    inputSchema: {
      type: "object",
      properties: {
        workout_json: {
          type: ["object", "string"],
          description: "Workout JSON object or string",
        },
        auto_clean: {
          type: "boolean",
          description: "Automatically clean the workout before upload",
          default: true,
        },
      },
      required: ["workout_json"],
    },
  },
  {
    name: "get_workouts",
    description: "Get list of workouts",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "number", default: 0 },
        limit: { type: "number", default: 10 },
      },
    },
  },
  {
    name: "get_workout_by_id",
    description: "Get a workout by ID",
    inputSchema: {
      type: "object",
      properties: {
        workout_id: { type: ["number", "string"], description: "Workout ID" },
      },
      required: ["workout_id"],
    },
  },
  {
    name: "prepare_workout",
    description: "Prepare a workout for upload by cleaning it",
    inputSchema: {
      type: "object",
      properties: {
        workout_json: {
          type: ["object", "string"],
          description: "Workout JSON to clean",
        },
      },
      required: ["workout_json"],
    },
  },
  // Activity Tools
  {
    name: "get_activities",
    description:
      "Get list of activities. Returns simplified activities by default (~200 tokens each) with only essential fields for analysis. Set simplify=false for full data (~1000 tokens each). Limited to 20 activities maximum.",
    inputSchema: {
      type: "object",
      properties: {
        start: { type: "number", default: 0 },
        limit: { type: "number", default: 10 },
        activitytype: {
          type: "string",
          description: "Filter by activity type",
        },
        simplify: {
          type: "boolean",
          default: true,
          description:
            "If true (default), returns only essential fields for analysis (~200 tokens/activity). If false, returns full activity data (~1000 tokens/activity)",
        },
      },
    },
  },
  {
    name: "get_last_activity",
    description: "Get the most recent activity",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_activities_by_date",
    description: "Get activities within a date range",
    inputSchema: {
      type: "object",
      properties: {
        startdate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        enddate: { type: "string", description: "End date (YYYY-MM-DD)" },
        activitytype: { type: "string" },
        sortorder: { type: "string", enum: ["asc", "desc"] },
      },
      required: ["startdate", "enddate"],
    },
  },
  {
    name: "get_activity",
    description: "Get a specific activity by ID",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: { type: ["number", "string"], description: "Activity ID" },
      },
      required: ["activity_id"],
    },
  },
  {
    name: "get_activity_details",
    description: "Get comprehensive activity details",
    inputSchema: {
      type: "object",
      properties: {
        activity_id: { type: ["number", "string"], description: "Activity ID" },
        maxchart: { type: "number", default: 2000 },
        maxpoly: { type: "number", default: 4000 },
      },
      required: ["activity_id"],
    },
  },
  {
    name: "get_activities_fordate",
    description: "Get activities for a specific date",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  // Health Tools
  {
    name: "get_daily_summary",
    description: "Get daily health summary",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "get_heart_rate_data",
    description: "Get heart rate data",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_sleep_data",
    description: "Get sleep data",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_stress_data",
    description: "Get stress data",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_body_battery",
    description: "Get body battery data",
    inputSchema: {
      type: "object",
      properties: {
        startdate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        enddate: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["startdate"],
    },
  },
  {
    name: "get_resting_heart_rate",
    description: "Get resting heart rate",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_hrv_data",
    description: "Get HRV (Heart Rate Variability) data",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_training_readiness",
    description: "Get training readiness score",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_steps_data",
    description: "Get steps data",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_respiration_data",
    description: "Get respiration data",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_spo2_data",
    description: "Get SpO2 (blood oxygen) data",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  // Performance Tools
  {
    name: "get_max_metrics",
    description: "Get VO2 Max and Fitness Age",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_training_status",
    description: "Get training status and load",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "get_endurance_score",
    description: "Get endurance score",
    inputSchema: {
      type: "object",
      properties: {
        startdate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        enddate: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["startdate"],
    },
  },
  {
    name: "get_race_predictions",
    description: "Get race time predictions",
    inputSchema: {
      type: "object",
      properties: {
        startdate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        enddate: { type: "string", description: "End date (YYYY-MM-DD)" },
        prediction_type: { type: "string", enum: ["latest", "daily"] },
      },
    },
  },
];

// Tool endpoint mapping
const toolEndpointMap = {
  // Workouts
  upload_workout: "/api/workout/upload_workout",
  get_workouts: "/api/workout/get_workouts",
  get_workout_by_id: "/api/workout/get_workout_by_id",
  prepare_workout: "/api/workout/prepare_workout",
  // Activities
  get_activities: "/api/activities/get_activities",
  get_last_activity: "/api/activities/get_last_activity",
  get_activities_by_date: "/api/activities/get_activities_by_date",
  get_activity: "/api/activities/get_activity",
  get_activity_details: "/api/activities/get_activity_details",
  get_activities_fordate: "/api/activities/get_activities_fordate",
  // Health
  get_daily_summary: "/api/health/get_daily_summary",
  get_heart_rate_data: "/api/health/get_heart_rate_data",
  get_sleep_data: "/api/health/get_sleep_data",
  get_stress_data: "/api/health/get_stress_data",
  get_body_battery: "/api/health/get_body_battery",
  get_resting_heart_rate: "/api/health/get_resting_heart_rate",
  get_hrv_data: "/api/health/get_hrv_data",
  get_training_readiness: "/api/health/get_training_readiness",
  get_steps_data: "/api/health/get_steps_data",
  get_respiration_data: "/api/health/get_respiration_data",
  get_spo2_data: "/api/health/get_spo2_data",
  // Performance
  get_max_metrics: "/api/performance/get_max_metrics",
  get_training_status: "/api/performance/get_training_status",
  get_endurance_score: "/api/performance/get_endurance_score",
  get_race_predictions: "/api/performance/get_race_predictions",
};

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!toolEndpointMap[name]) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const endpoint = toolEndpointMap[name];
  const body = args || {};

  try {
    const result = await apiRequest("POST", endpoint, body);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: error.message,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Garmin Connect MCP Client server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
