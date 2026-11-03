// LowDB, stores the schedules in /persistent/free-sleep-data/lowdb/settingsDB.json

!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="6cfd2f23-db66-5051-bb99-af087ea64639")}catch(e){}}();
import _ from 'lodash';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import config from '../config.js';
const defaultSideSettings = {
    name: 'Side',
    awayMode: false,
    scheduleOverrides: {
        temperatureSchedules: {
            disabled: false,
            expiresAt: ''
        },
        alarm: {
            disabled: false,
            timeOverride: '',
            expiresAt: '',
        }
    },
    taps: {
        doubleTap: {
            type: 'temperature',
            change: 'decrement',
            amount: 1,
        },
        tripleTap: {
            type: 'temperature',
            change: 'increment',
            amount: 1,
        },
        quadTap: {
            type: 'alarm',
            behavior: 'dismiss',
            snoozeDuration: 60,
            inactiveAlarmBehavior: 'power',
        },
    },
    autopilot: {
        enabled: false,
        dryRun: true,
        baseTemperatureF: 72,
        entryTemperatureF: 76,
        earlyCoolF: 3,
        wakeRiseF: 4,
        napTemperatureF: 72,
        maxAdjustmentF: 4,
        minMinutesBetweenChanges: 20,
        autoEndAbsentMinutes: 60,
        maxSessionHours: 14,
        napMaxMinutes: 90,
        roomCompensation: {
            enabled: false,
            referenceC: 20,
            calibrationOffsetC: 0,
        },
    },
};
const defaultData = {
    id: crypto.randomUUID(),
    timeZone: 'UTC',
    temperatureFormat: 'fahrenheit',
    rebootDaily: true,
    left: {
        ..._.cloneDeep(defaultSideSettings),
        name: 'Left',
    },
    right: {
        ..._.cloneDeep(defaultSideSettings),
        name: 'Right',
    },
    primePodDaily: {
        enabled: false,
        time: '14:00',
    },
};
const file = new JSONFile(`${config.lowDbFolder}settingsDB.json`);
const settingsDB = new Low(file, defaultData);
await settingsDB.read();
// Allows us to add default values to the settings if users have existing settingsDB.json data
settingsDB.data = _.merge({}, defaultData, settingsDB.data);
await settingsDB.write();
export default settingsDB;
//# sourceMappingURL=settings.js.map
//# debugId=6cfd2f23-db66-5051-bb99-af087ea64639
