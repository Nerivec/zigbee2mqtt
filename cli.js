#!/usr/bin/env node
const path = require("node:path");
process.env.ZIGBEE2MQTT_DATA = process.env.ZIGBEE2MQTT_DATA || path.join(process.env.HOME, ".z2m");
require("./index");
