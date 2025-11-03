# Garmin Connect MCP Client

MCP Server client that consumes the Garmin Connect HTTP API.

## Installation

```bash
npm install -g @mart1/garmin-connect-mcp-client
```

Or use with npx:
```bash
npx @mart1/garmin-connect-mcp-client
```

## Configuration

Set environment variables:

```bash
export GARMIN_EMAIL="your@email.com"
export GARMIN_PASSWORD="your_password"
export API_KEY="your-api-key"  # Optional, if API requires it
export GARMIN_API_URL="https://fgggkckgk8osog4osgg4484k.mart1m.fr"  # Optional, defaults to your API
```

## Usage with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garmin-connect": {
      "command": "npx",
      "args": ["-y", "@mart1/garmin-connect-mcp-client"],
      "env": {
        "GARMIN_EMAIL": "your@email.com",
        "GARMIN_PASSWORD": "your_password"
      }
    }
  }
}
```

## Available Tools (25 tools)

### Workout Tools (4 tools)

- **upload_workout** - Upload a workout to Garmin Connect
  - Parameters: `workout_json` (required), `auto_clean` (optional, default: true)
  
- **get_workouts** - Get list of workouts
  - Parameters: `start` (optional, default: 0), `limit` (optional, default: 10)
  
- **get_workout_by_id** - Get a workout by ID
  - Parameters: `workout_id` (required)
  
- **prepare_workout** - Prepare a workout for upload by cleaning it
  - Parameters: `workout_json` (required)

### Activity Tools (6 tools)

- **get_activities** - Get list of activities
  - Parameters: `start` (optional, default: 0), `limit` (optional, default: 20), `activitytype` (optional)
  
- **get_last_activity** - Get the most recent activity
  - Parameters: none
  
- **get_activities_by_date** - Get activities within a date range
  - Parameters: `startdate` (required, YYYY-MM-DD), `enddate` (required, YYYY-MM-DD), `activitytype` (optional), `sortorder` (optional: "asc" or "desc")
  
- **get_activity** - Get a specific activity by ID
  - Parameters: `activity_id` (required)
  
- **get_activity_details** - Get comprehensive activity details with GPS track
  - Parameters: `activity_id` (required), `maxchart` (optional, default: 2000), `maxpoly` (optional, default: 4000)
  
- **get_activities_fordate** - Get activities for a specific date
  - Parameters: `date` (required, YYYY-MM-DD)

### Health Data Tools (11 tools)

- **get_daily_summary** - Get daily health and activity summary
  - Parameters: `date` (optional, YYYY-MM-DD)
  
- **get_heart_rate_data** - Get heart rate data
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_sleep_data** - Get sleep data
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_stress_data** - Get stress data
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_body_battery** - Get body battery energy levels
  - Parameters: `startdate` (required, YYYY-MM-DD), `enddate` (optional, YYYY-MM-DD)
  
- **get_resting_heart_rate** - Get resting heart rate
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_hrv_data** - Get HRV (Heart Rate Variability) data
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_training_readiness** - Get training readiness score
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_steps_data** - Get steps data
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_respiration_data** - Get respiration data
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_spo2_data** - Get SpO2 (blood oxygen saturation) data
  - Parameters: `date` (required, YYYY-MM-DD)

### Performance Metrics Tools (4 tools)

- **get_max_metrics** - Get VO2 Max and Fitness Age
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_training_status** - Get training status and load
  - Parameters: `date` (required, YYYY-MM-DD)
  
- **get_endurance_score** - Get endurance score
  - Parameters: `startdate` (required, YYYY-MM-DD), `enddate` (optional, YYYY-MM-DD)
  
- **get_race_predictions** - Get race time predictions
  - Parameters: `startdate` (optional), `enddate` (optional), `prediction_type` (optional: "latest" or "daily")

