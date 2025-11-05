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
    version: "0.3.4",
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
    description: `Upload a workout to Garmin Connect. The workout must be in JSON format compliant with the Garmin API.

REQUIRED STRUCTURE:
- workoutName (string): Name of the workout
- sportType (object): Must include sportTypeId, sportTypeKey, displayOrder
  * sportTypeId: 1=running, 2=cycling, 3=swimming, etc.
  * sportTypeKey: "running", "cycling", "swimming", etc.
- workoutSegments (array): Array of workout segments, each containing:
  * segmentOrder (integer): Sequential order starting at 1
  * sportType (object): Same structure as root sportType
  * workoutSteps (array): Array of steps (warmup, intervals, recovery, cooldown, repeat groups)

STEP TYPES (ExecutableStepDTO):
- warmup: stepTypeId=1, stepTypeKey="warmup"
- cooldown: stepTypeId=2, stepTypeKey="cooldown"
- interval: stepTypeId=3, stepTypeKey="interval"
- recovery: stepTypeId=4, stepTypeKey="recovery"
- repeat: stepTypeId=6, stepTypeKey="repeat" (RepeatGroupDTO)

END CONDITIONS:
- time: conditionTypeId=2, conditionTypeKey="time", endConditionValue in seconds
- distance: conditionTypeId=3, conditionTypeKey="distance", endConditionValue in meters
- iterations: conditionTypeId=7, conditionTypeKey="iterations", endConditionValue=number of repeats

REQUIRED FIELDS FOR EACH STEP:
- type: "ExecutableStepDTO" or "RepeatGroupDTO"
- stepOrder: Sequential integer
- stepType: {stepTypeId, stepTypeKey, displayOrder}
- endCondition: {conditionTypeId, conditionTypeKey, displayOrder, displayable}
- endConditionValue: Number (seconds, meters, or iterations)
- targetType: {workoutTargetTypeId, workoutTargetTypeKey, displayOrder}
  * no.target: workoutTargetTypeId=1
  * pace.zone: workoutTargetTypeId=6 (requires targetValueOne, targetValueTwo, zoneNumber)
  
PACE ZONE FORMAT (targetValueOne/targetValueTwo):
  REQUIRED FORMAT: METERS PER SECOND (m/s) - This is the ONLY format accepted by Garmin API.
  
  Conversion formula: min:sec/km → 1000 / ((minutes × 60) + seconds)
  
  Examples:
  - 3:45 min/km = 1000 / 225 = 4.444 m/s
  - 3:50 min/km = 1000 / 230 = 4.348 m/s
  - 3:55 min/km = 1000 / 235 = 4.255 m/s
  - 4:00 min/km = 1000 / 240 = 4.167 m/s
  - 4:30 min/km = 1000 / 270 = 3.704 m/s
  - 4:40 min/km = 1000 / 280 = 3.571 m/s
  - 5:30 min/km = 1000 / 330 = 3.030 m/s
  
  IMPORTANT: targetValueOne > targetValueTwo (faster pace = higher m/s)
  - targetValueOne = MINIMUM pace (faster, higher m/s value)
  - targetValueTwo = MAXIMUM pace (slower, lower m/s value)
  
  For a pace zone around 3:50/km (e.g., 3:45-3:55/km):
  {
    "targetType": {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone", "displayOrder": 6},
    "targetValueOne": 4.444,  // 3:45/km (faster) in m/s
    "targetValueTwo": 4.255,  // 3:55/km (slower) in m/s
    "zoneNumber": 1
  }
  
  For exactly 3:50/km:
  {
    "targetType": {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone", "displayOrder": 6},
    "targetValueOne": 4.348,  // 3:50/km in m/s (faster limit)
    "targetValueTwo": 4.348,  // 3:50/km in m/s (slower limit)
    "zoneNumber": null,  // Can be 1 or null (both work, API may return null)
    "targetValueUnit": null  // Should be null for pace zones
  }
  
  For 3:45-3:55/km zone (example from Garmin API response):
  {
    "targetType": {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone", "displayOrder": 6},
    "targetValueOne": 4.4444445,  // 3:45/km in m/s (faster)
    "targetValueTwo": 4.2553192,  // 3:55/km in m/s (slower)
    "zoneNumber": null,  // API returns null even when set
    "targetValueUnit": null
  }
  
  FIELD EXPLANATIONS:
  - zoneNumber: Zone identifier for the target metric (pace, heart rate, etc.)
    * For pace.zone: Can be 1 or null (both work, API may return null)
    * For other target types: Can be 1-5 depending on zone type
    * Purpose: Identifies which zone in a zone-based target system
    * Note: Garmin API may return null even when set to 1
  - targetValueUnit: Unit of measurement for targetValueOne/targetValueTwo
    * For pace.zone: Should be null (API infers m/s from pace.zone type)
    * Possible values: "sec_per_km", "m_per_s", null, etc.
    * Purpose: Explicitly specifies the unit, but null is standard for pace zones
  
  ⚠️ COMMON MISTAKE - VALUES THAT GIVE 4:30-4:40/km (WRONG):
  - targetValueOne: 3.7037037 → This is 4:30/km (WRONG for 3:50/km)
  - targetValueTwo: 3.5714285 → This is 4:40/km (WRONG for 3:50/km)
  - These values are INVERTED and TOO LOW - they give 4:35/km display
  
  ✅ CORRECT VALUES FOR 3:50/km:
  - targetValueOne: 4.348 (or 4.444 for 3:45/km zone)
  - targetValueTwo: 4.348 (or 4.255 for 3:55/km zone)
  
  CRITICAL RULES: 
  - targetValueOne MUST be > targetValueTwo (faster = higher m/s)
  - For 3:50/km: targetValueOne = 4.348, targetValueTwo = 4.348
  - For 3:45-3:55/km zone: targetValueOne = 4.444, targetValueTwo = 4.255
  - zoneNumber can be 1 or null (both work)
  - targetValueUnit should be null for pace zones
  
  FORMULA TO CONVERT: min:sec/km → 1000 / ((minutes × 60) + seconds)
  Example: 3:50/km = 1000 / 230 = 4.348 m/s
  
  Quick conversion table:
  - 3:30/km = 4.762 m/s
  - 3:45/km = 4.444 m/s
  - 3:50/km = 4.348 m/s
  - 4:00/km = 4.167 m/s
  - 4:15/km = 3.922 m/s
  - 4:30/km = 3.704 m/s
  - 5:00/km = 3.333 m/s
- strokeType: {strokeTypeId: 0, displayOrder: 0}
- equipmentType: {equipmentTypeId: 0, displayOrder: 0}
- numberOfIterations: 1 for single steps, N for repeat groups
- workoutSteps: [] for ExecutableStepDTO, array for RepeatGroupDTO
- smartRepeat: false (usually)

COMMON ERRORS TO AVOID:
- Do NOT include workoutId, ownerId, stepId, childStepId (auto-cleaned if auto_clean=true)
- Do NOT wrap in array or "output" object - send the workout object directly
- Do NOT use "kind" field - it doesn't exist in Garmin API
- Ensure all IDs (stepTypeId, conditionTypeId, etc.) are present, not just keys
- For pace zones: targetValueOne > targetValueTwo (faster = higher m/s), zoneNumber can be 1 or null (both work)

Generated IDs (workoutId, stepId, etc.) will be automatically cleaned if auto_clean=true (default).`,
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
