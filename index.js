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
    version: "0.3.6",
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
    description: `Upload a workout to Garmin Connect. The workout must be a SINGLE JSON object starting directly with {"workoutName": ...}. Do NOT wrap in arrays or "output" objects.

🧩 STRUCTURE GARMIN REQUIRED:

Root structure:
{
  "workoutName": "YYYY-MM-DD - Workout Name",
  "sportType": {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
  "author": {},
  "estimatedDurationInSecs": <sum of all executable durations including repetitions>,
  "workoutSegments": [{ "segmentOrder": 1, "sportType": {...}, "workoutSteps": [...] }]
}

🧱 STEP TYPES:

ExecutableStepDTO (single step):
- type: "ExecutableStepDTO"
- stepOrder: >=1 (sequential)
- stepType: {stepTypeId, stepTypeKey, displayOrder}
- endCondition: {conditionTypeId, conditionTypeKey, displayOrder, displayable}
- endConditionValue: number (seconds or meters)
- targetType: {workoutTargetTypeId, workoutTargetTypeKey, displayOrder}
- strokeType: {strokeTypeId: 0, displayOrder: 0}
- equipmentType: {equipmentTypeId: 0, displayOrder: 0}
- numberOfIterations: 1
- workoutSteps: []
- smartRepeat: false
FORBIDDEN on ExecutableStepDTO: workoutSteps with content, smartRepeat=true, numberOfIterations != 1

RepeatGroupDTO (repeating group):
- type: "RepeatGroupDTO"
- stepOrder: >=1 (sequential)
- stepType: {stepTypeId: 6, stepTypeKey: "repeat", displayOrder: 6}
- numberOfIterations: >=1 (number of repeats)
- endCondition: {conditionTypeId: 7, conditionTypeKey: "iterations", displayOrder: 7, displayable: false}
- endConditionValue: number of iterations
- targetType: {workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target", displayOrder: 1}
- strokeType: {strokeTypeId: 0, displayOrder: 0}
- equipmentType: {equipmentTypeId: 0, displayOrder: 0}
- smartRepeat: false
- workoutSteps: [ ...child steps... ]
FORBIDDEN on RepeatGroupDTO: targetValueOne, targetValueTwo

⚙️ MAPPINGS GARMIN:

stepType:
- warmup: stepTypeId=1, stepTypeKey="warmup", displayOrder=1
- cooldown: stepTypeId=2, stepTypeKey="cooldown", displayOrder=2
- interval: stepTypeId=3, stepTypeKey="interval", displayOrder=3
- recovery: stepTypeId=4, stepTypeKey="recovery", displayOrder=4
- repeat: stepTypeId=6, stepTypeKey="repeat", displayOrder=6

endCondition:
- time: conditionTypeId=2, conditionTypeKey="time", displayOrder=2, displayable=true
- distance: conditionTypeId=3, conditionTypeKey="distance", displayOrder=3, displayable=true
- iterations: conditionTypeId=7, conditionTypeKey="iterations", displayOrder=7, displayable=false

targetType:
- no.target: workoutTargetTypeId=1, workoutTargetTypeKey="no.target", displayOrder=1
- pace.zone: workoutTargetTypeId=6, workoutTargetTypeKey="pace.zone", displayOrder=6

🧭 PACE ZONE CONVERSION (CRITICAL):

For any pace in "m:ss/km" format (e.g., 3:50/km):

1. Parse: minutes = integer before ":", seconds = integer after ":"
2. Calculate: paceSec = (minutes × 60) + seconds
3. If paceSec < 60 or paceSec > 420 → use no.target instead
4. Create ±5s band:
   - lowerSec = paceSec + 5 (slower, higher seconds)
   - upperSec = paceSec - 5 (faster, lower seconds)
5. Convert to m/s (Garmin requires m/s format):
   - lowerMs = 1000 / lowerSec (slower pace = lower m/s)
   - upperMs = 1000 / upperSec (faster pace = higher m/s)
6. Apply: targetValueOne = upperMs, targetValueTwo = lowerMs

Example: 3:50/km
- paceSec = 230
- lowerSec = 235, upperSec = 225
- lowerMs = 1000/235 = 4.255, upperMs = 1000/225 = 4.444
- targetValueOne = 4.444 (faster), targetValueTwo = 4.255 (slower)

CRITICAL: targetValueOne > targetValueTwo (faster = higher m/s)

IMPORTANT RULES:
- Never use speed.zone if you want min/km display - use pace.zone
- Never set pace target on warmup/recovery/cooldown
- Never set pace target on RepeatGroupDTO level
- zoneNumber: can be 1 or null (both work)
- targetValueUnit: should be null for pace zones

🧠 DURATIONS, DISTANCES, SUMS:
- time: in seconds
- distance: in meters
- If distance + pace zone: estimated duration = distance_m / ((targetValueOne + targetValueTwo) / 2)
- estimatedDurationInSecs: exact sum of all executable durations, repetitions included
  Example: warmup 900s + (3×100m + 3×45s) + (12×400m + 12×75s) + cooldown 600s = 3939s

🧩 COMPOSITION RULES:
- "interval", "vma", "hills" → require at least one RepeatGroupDTO
- "tempo", "endurance", "easy", "long_run" → no RepeatGroupDTO (only ExecutableStepDTO)
- Defaults if not specified: Warmup=300s, Cooldown=300s
- "10x(30/30)" = RepeatGroupDTO (10 iterations: 30s interval + 30s recovery)
- "2x10x(30/30) + 3' between series" = RepeatGroupDTO + 180s recovery + RepeatGroupDTO
- "Lignes droites" = RepeatGroupDTO 3× (100m interval + 45s recovery), no target

COMMON ERRORS TO AVOID:
- Do NOT include workoutId, ownerId, stepId, childStepId (auto-cleaned if auto_clean=true)
- Do NOT wrap in array or "output" object - send workout object directly
- Do NOT use "kind" field - it doesn't exist
- Ensure all IDs are present (stepTypeId, conditionTypeId, etc.), not just keys
- targetValueOne must be > targetValueTwo for pace zones

Generated IDs will be automatically cleaned if auto_clean=true (default).`,
    inputSchema: {
      type: "object",
      properties: {
        workout_json: {
          type: ["object", "string"],
          description: `Workout in JSON format (string or object). Must follow Garmin API structure with all required fields. Send the workout object directly, not wrapped in array or 'output' object.

Example minimal structure:
{
  "workoutName": "My Workout",
  "sportType": {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
  "author": {},
  "workoutSegments": [{
    "segmentOrder": 1,
    "sportType": {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
    "workoutSteps": [...]
  }]
}`,
        },
        auto_clean: {
          type: "boolean",
          description:
            "If true (default), automatically clean the workout by removing generated IDs (workoutId, stepId, childStepId, ownerId) before upload.",
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
        fields: {
          type: "array",
          items: { type: "string" },
          description: "List of fields to include in the response",
        },
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
