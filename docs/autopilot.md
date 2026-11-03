# Autopilot

Autopilot runs your side of the Pod along a slow temperature curve during a **sleep session** you start yourself, and logs every decision so you can see what it did and why. It follows a schedule rather than reacting to sleep stages, because a bed sensor can't tell light from deep sleep reliably, and no trial shows that stage-triggered control beats a simple schedule.

## Sleep sessions

Autopilot only controls a side while a session is running, so time spent in bed during the day is ignored.

- **Start**: the *Start sleep* / *Start nap* buttons on the Autopilot page, a triple tap on the bed (enable it in Autopilot settings), or `POST /api/autopilot/session/start`.
- **End**: *End sleep*, another triple tap, or `POST /api/autopilot/session/end`. The side turns off.
- **Auto-end**: after 60 minutes out of bed (configurable) the session ends, and its end time is set back to when you got up. Presence blips shorter than 2 minutes don't reset the timer. Sessions also end after the maximum length (14 h by default).
- **Resume**: a session that ended in the last 15 minutes can be resumed from the app.
- **Naps**: sessions started with *Start nap*, or shorter than 90 minutes, are classified as naps.

## The temperature curve

Times count from when the session starts. Sleep onset is assumed to be 10 minutes later.

| Part | When | Default |
|---|---|---|
| Entry | first 15 min | 76°F, neutral rather than cold |
| Cooling | ramps down, then holds until 3 h after onset | 3°F below base (69°F) |
| Easing | up to 4.5 h after onset | drifts up to base |
| Steady | the rest of the session | 72°F base |
| Wake-up | last 30 min before the optional wake time | +4°F, capped at 80°F or base +6°F, and stops at the wake time |

The schedule never moves faster than 1°F per 7.5 minutes. While someone is in bed the temperature stays within 60-100°F. Every number is a starting point based on engineering judgement, so change them to whatever feels best.

*Get bed ready* warms the side to the entry temperature before you get in. It turns itself off after an hour if no session starts, and isn't available in dry run.

## Body clock

REM follows your body clock as well as time asleep, so someone sleeping in the morning can reach REM in the first cycle. Autopilot estimates the coldest point of your day from the middle of your full sleep sessions over the last 14 days, plus 1.2 hours. Early cooling is limited to 2°F until it has 4 sessions, and for sessions where REM is likely early on (2-6 hours after that coldest point). The depth is decided once per session, so it never steps mid-sleep. Expect the estimate to be off by 2-3 hours.

## Room compensation

Off by default, because the hub's room sensor reads unreliably while the Pod runs, so it works best with an external sensor (below). When on, a room more than 1°C above the reference (20°C) cools the bed 1°F per °C, up to the max adjustment. Below 18°C the bed warms 0.5°F per °C, up to 2°F, because cold barely changes sleep under bedding. Room changes are rate limited (20 min by default).

**Room reading:** a fresh external reading (under 15 minutes old) is used first. If it stops arriving, Autopilot falls back to the hub sensor, then the cover sensor. *Sensor calibration* only applies to the Pod's own sensors.

To send a room sensor from Home Assistant, add this to `configuration.yaml`, restart, and use an automation that calls `rest_command.free_sleep_room` every 5 minutes:

```yaml
rest_command:
  free_sleep_room:
    url: "http://YOUR_POD_IP:3000/api/autopilot/room"
    method: post
    content_type: "application/json"
    payload: '{"temperatureC": {{ temperature }}}'
```

The biometrics stream averages the hub (`frzTemp.amb`) and cover (`bedTemp.amb`, `hu`) sensors into 5-minute buckets and posts them to `POST /api/autopilot/ambient`.

## Dry run

New installs start in dry run: decisions are logged and charted but the temperature is not changed. Turn it off in Autopilot settings once the decisions look right.

## Schedules

While Autopilot is enabled for a side, that side's power and temperature schedules are skipped. Alarms still run.

Away mode on either side mirrors every command to both sides, and a side in away mode can't start a session.

## API

| Method | Route | |
|---|---|---|
| GET | `/api/autopilot/status` | Live state for both sides |
| POST | `/api/autopilot/session/start` | `{ side, wakeAt?, nap? }` (`wakeAt` in Unix seconds) |
| POST | `/api/autopilot/session/end` | `{ side }` |
| POST | `/api/autopilot/session/resume` | `{ side }` |
| POST | `/api/autopilot/prepare` | `{ side }`, warm the bed before getting in |
| GET | `/api/autopilot/sessions?side=&limit=` | Recent sessions |
| GET | `/api/autopilot/sessions/:id` | Session with decisions and ambient readings |
| POST | `/api/autopilot/ambient` | Used by the biometrics stream |
| POST | `/api/autopilot/room` | `{ temperatureC }`, from a trusted room sensor |

## Installing this fork

The install and update scripts download from `vandarii/free-sleep`. To install a branch other than `main`, set `FREE_SLEEP_BRANCH`.

Free Sleep blocks the Pod's internet access, so `curl` hangs unless you lift the block first. Over SSH on the Pod:

```bash
sh /home/dac/free-sleep/scripts/unblock_internet_access.sh
curl -fsSL https://raw.githubusercontent.com/vandarii/free-sleep/autopilot/scripts/install.sh | sudo FREE_SLEEP_BRANCH=autopilot bash
sh /home/dac/free-sleep/scripts/block_internet_access.sh
```

The installer backs up the database to `/persistent/free-sleep-data/free-sleep-copy.db` before running migrations. The in-app and Home Assistant *Update* buttons handle the internet block themselves, but they install `main`.
