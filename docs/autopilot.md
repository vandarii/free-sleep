# Autopilot

Autopilot runs your side of the Pod through sleep stages during a **sleep session** you start yourself, adjusts for the room temperature, and logs every decision so you can see what it did and why.

## Sleep sessions

Autopilot only controls a side while a session is running, so time spent in bed during the day is ignored.

- **Start**: the *Start sleep* / *Start nap* buttons on the Autopilot page, a triple tap on the bed (enable it in Autopilot settings), or `POST /api/autopilot/session/start`.
- **End**: *End sleep*, another triple tap, or `POST /api/autopilot/session/end`. The side turns off.
- **Auto-end**: after 60 minutes out of bed (configurable) the session ends, and its end time is set back to when you got up. Presence blips shorter than 2 minutes don't reset the timer. Sessions also end after the maximum length (14 h by default).
- **Resume**: a session that ended in the last 15 minutes can be resumed from the app.
- **Naps**: sessions started with *Start nap*, or shorter than 90 minutes, are classified as naps.

## Stages

Stages are estimated from the time since the session started (there is no clinical stage detection):

| Stage | Window | Default offset from base (68°F) |
|---|---|---|
| Falling asleep | first 30 min | −2°F |
| Deep sleep | 30 min – 3 h | −5°F |
| REM | 3 h onwards | −2°F |
| Wake-up | last 30 min before the optional wake time | +4°F, ramped |

## Room compensation

The biometrics stream averages the hub (`frzTemp.amb`) and cover (`bedTemp.amb`, `hu`) sensors into 5-minute buckets and posts them to `POST /api/autopilot/ambient`. A room more than 1°C away from the reference (22°C) moves the bed 1°F per °C, capped at the max adjustment. Room changes are rate limited (20 min by default); stage changes and the wake ramp apply immediately. Use *Sensor calibration* to correct the hub reading against a room thermometer.

## Dry run

New installs start in dry run: decisions are logged and charted but the temperature is not changed. Turn it off in Autopilot settings once the decisions look right.

## Schedules

While Autopilot is enabled for a side, that side's power and temperature schedules are skipped. Alarms still run.

## API

| Method | Route | |
|---|---|---|
| GET | `/api/autopilot/status` | Live state for both sides |
| POST | `/api/autopilot/session/start` | `{ side, wakeAt?, nap? }` (`wakeAt` in Unix seconds) |
| POST | `/api/autopilot/session/end` | `{ side }` |
| POST | `/api/autopilot/session/resume` | `{ side }` |
| GET | `/api/autopilot/sessions?side=&limit=` | Recent sessions |
| GET | `/api/autopilot/sessions/:id` | Session with decisions and ambient readings |
| POST | `/api/autopilot/ambient` | Used by the biometrics stream |

## Installing this fork

The install and update scripts download from `vandarii/free-sleep`. To install a branch other than `main`, set `FREE_SLEEP_BRANCH`.

Free Sleep blocks the Pod's internet access, so `curl` hangs unless you lift the block first. Over SSH on the Pod:

```bash
sh /home/dac/free-sleep/scripts/unblock_internet_access.sh
curl -fsSL https://raw.githubusercontent.com/vandarii/free-sleep/autopilot/scripts/install.sh | sudo FREE_SLEEP_BRANCH=autopilot bash
sh /home/dac/free-sleep/scripts/block_internet_access.sh
```

The installer backs up the database to `/persistent/free-sleep-data/free-sleep-copy.db` before running migrations. The in-app and Home Assistant *Update* buttons handle the internet block themselves, but they install `main`.
