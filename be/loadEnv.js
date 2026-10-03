import dotenv from 'dotenv';
import fs from 'fs';

// When docker-compose mounts the real .env-be file into the container (see
// the "volumes" entry added for this), it shows up here at this path. If
// it's not mounted (older docker-compose.yaml, nothing changed), this file
// simply doesn't exist and dotenv.config() below fails silently, exactly
// like the old `dotenv.config()` with no path did when there was no local
// .env file - no change in behavior for anyone who hasn't updated their
// docker-compose.yaml.
const ENV_FILE_PATH = process.env.ENV_FILE_PATH || './.env-be';

dotenv.config({ path: ENV_FILE_PATH });

var devices = [];
var gates = [];
var subEventTypes = [];

// Builds devices/gates/subEventTypes from whatever is currently in
// process.env. Mutates the exported arrays/object in place (instead of
// reassigning them) so that every other file that already did
// `import { devices } from "./loadEnv.js"` keeps seeing the refreshed
// values automatically - no need to re-import anything.
function buildConfig() {
  for (const key of Object.keys(devices)) {
    delete devices[key];
  }
  gates.length = 0;
  subEventTypes.length = 0;

  const devices_connected = parseInt(process.env.DEVICES_CONNECTED, 10) || 0;
  const subEventTypes_enabled = parseInt(process.env.SUBEVENTTYPES_ENABLED, 10) || 0;

  for (let i = 1; i <= devices_connected; i++) {

    const devicename_key = "FACEID_" + i + "_DEVICENAME";
    const devicename = process.env[devicename_key];

    gates.push(devicename);

    devices[devicename] = {
      "type": process.env["FACEID_" + i + "_TYPE"],
      "name": process.env["FACEID_" + i + "_DEVICENAME"],
      "username": process.env["FACEID_" + i + "_USER"],
      "password": process.env["FACEID_" + i + "_PASS"],
      "ip": process.env["FACEID_" + i + "_IP"],
      "use_alpr": process.env["FACEID_" + i + "_USE_APLR"],
      "rtsp_url": process.env["FACEID_" + i + "_RTSP_URL"],
      "time_elapsed_since_auth": process.env["FACEID_" + i + "_TIME_ELAPSED_SINCE_AUTH"],
      "waiting_time": process.env["FACEID_" + i + "_WAITING_TIME"]
    };
  }

  for (let i = 1; i <= subEventTypes_enabled; i++) {

    const subEventType_key = "SUBEVENTTYPE_" + i;
    const cardType_key = "CARDTYPE_" + i;
    const isPanic_key = "PANIC_" + i;

    const subEventType = process.env[subEventType_key];
    const cardType = process.env[cardType_key];
    const isPanic = (process.env[isPanic_key]) ? process.env[isPanic_key] : 0;

    subEventTypes.push(
      {
        "subEventType": subEventType,
        "cardType": cardType,
        "isPanic": isPanic
      }
    );
  }
}

buildConfig();

// Re-reads ENV_FILE_PATH from disk (picking up whatever the admin panel, or
// a person editing the file by hand, just changed), applies those values on
// top of process.env, and rebuilds devices/gates/subEventTypes. Everything
// that already imported { devices, gates, subEventTypes } sees the new
// values immediately - no restart of the process needed.
//
// One exception: PORT. Node already has a socket bound to the old port, and
// that can only change by actually restarting the process, same as before.
function reloadConfig() {
  const parsed = dotenv.parse(fs.readFileSync(ENV_FILE_PATH));
  for (const key of Object.keys(parsed)) {
    process.env[key] = parsed[key];
  }
  buildConfig();
}

export { devices, gates, subEventTypes, reloadConfig, ENV_FILE_PATH };
