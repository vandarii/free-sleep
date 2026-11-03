// Run with Node 24: node --test tests/autopilot.test.mjs
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  describeDecision,
  planTemperature,
  resolveStage,
  roomAdjustmentF,
  roomTemperatureC,
  shouldApply,
  stageTargetF,
  wakeRampF,
} from '../server/src/autopilot/stages.ts';
import { getAbsentSince, recordPresence, resetPresence } from '../server/src/autopilot/presenceTracker.ts';

const START = 1_762_200_000;
const minutes = (count) => count * 60;

const settings = () => ({
  enabled: true,
  dryRun: true,
  baseTemperatureF: 68,
  stageOffsetsF: { falling: -2, deep: -5, rem: -2, wake: 4 },
  napTemperatureF: 66,
  maxAdjustmentF: 4,
  minMinutesBetweenChanges: 20,
  autoEndAbsentMinutes: 60,
  maxSessionHours: 14,
  napMaxMinutes: 90,
  roomCompensation: { enabled: true, referenceC: 22, calibrationOffsetC: 0 },
});

test('stages follow time since the session started', () => {
  assert.equal(resolveStage({ startedAt: START, now: START + minutes(10) }), 'falling');
  assert.equal(resolveStage({ startedAt: START, now: START + minutes(30) }), 'deep');
  assert.equal(resolveStage({ startedAt: START, now: START + minutes(179) }), 'deep');
  assert.equal(resolveStage({ startedAt: START, now: START + minutes(180) }), 'rem');
});

test('the wake stage takes over 30 minutes before the wake time', () => {
  const wakeAt = START + minutes(480);
  assert.equal(resolveStage({ startedAt: START, now: wakeAt - minutes(31), wakeAt }), 'rem');
  assert.equal(resolveStage({ startedAt: START, now: wakeAt - minutes(30), wakeAt }), 'wake');
  // A wake time early in the session still wins over the falling-asleep stage
  assert.equal(resolveStage({ startedAt: START, now: START + minutes(5), wakeAt: START + minutes(20) }), 'wake');
});

test('stage targets are base plus offset, clamped to the pod range', () => {
  const config = settings();
  assert.equal(stageTargetF(config, 'deep'), 63);
  assert.equal(stageTargetF(config, 'wake'), 72);
  config.baseTemperatureF = 57;
  assert.equal(stageTargetF(config, 'deep'), 55);
});

test('the wake ramp moves linearly from the REM target to the wake target', () => {
  const config = settings();
  const wakeAt = START + minutes(480);
  assert.equal(wakeRampF(config, wakeAt - minutes(30), wakeAt), 66);
  assert.equal(wakeRampF(config, wakeAt - minutes(15), wakeAt), 69);
  assert.equal(wakeRampF(config, wakeAt, wakeAt), 72);
  assert.equal(wakeRampF(config, wakeAt + minutes(10), wakeAt), 72);
});

test('room compensation has a deadband, a direction and a cap', () => {
  const config = settings();
  assert.equal(roomAdjustmentF(config, 22.8), 0);
  assert.equal(roomAdjustmentF(config, 24), -2);
  assert.equal(roomAdjustmentF(config, 19), 3);
  assert.equal(roomAdjustmentF(config, 35), -4);
  assert.equal(roomAdjustmentF(config, null), 0);
  config.roomCompensation.enabled = false;
  assert.equal(roomAdjustmentF(config, 30), 0);
});

test('room temperature prefers the hub sensor and applies calibration', () => {
  const config = settings();
  config.roomCompensation.calibrationOffsetC = -1.5;
  const reading = { timestamp: START, hubAmbC: 24, coverAmbC: 26, humidity: 50, leftBodyC: null, rightBodyC: null };
  assert.equal(roomTemperatureC(reading, config), 22.5);
  assert.equal(roomTemperatureC({ ...reading, hubAmbC: null }, config), 24.5);
  assert.equal(roomTemperatureC(null, config), null);
});

test('plans explain why the temperature is what it is', () => {
  const config = settings();
  const deep = planTemperature({ settings: config, startedAt: START, now: START + minutes(60), isNap: false, roomC: 22 });
  assert.deepEqual([deep.stage, deep.desiredF, deep.reason], ['deep', 63, 'stage']);

  const warmRoom = planTemperature({ settings: config, startedAt: START, now: START + minutes(60), isNap: false, roomC: 25 });
  assert.deepEqual([warmRoom.desiredF, warmRoom.reason], [60, 'room']);

  const nap = planTemperature({ settings: config, startedAt: START, now: START + minutes(60), isNap: true, roomC: 25 });
  assert.deepEqual([nap.desiredF, nap.reason], [66, 'nap']);
});

test('room changes are rate limited but stage changes apply at once', () => {
  const now = START + minutes(60);
  const roomPlan = { stage: 'deep', stageTargetF: 63, desiredF: 61, reason: 'room', detail: null };
  const base = { lastStage: 'deep', lastSetF: 63, now, minMinutesBetweenChanges: 20 };
  assert.equal(shouldApply({ ...base, plan: roomPlan, lastChangeAt: now - minutes(5) }), false);
  assert.equal(shouldApply({ ...base, plan: roomPlan, lastChangeAt: now - minutes(20) }), true);
  assert.equal(shouldApply({ ...base, plan: { ...roomPlan, desiredF: 63 }, lastChangeAt: now - minutes(60) }), false);
  const remPlan = { stage: 'rem', stageTargetF: 66, desiredF: 66, reason: 'stage', detail: null };
  assert.equal(shouldApply({ ...base, plan: remPlan, lastChangeAt: now - minutes(1) }), true);
  assert.equal(shouldApply({ ...base, lastStage: null, lastSetF: null, plan: roomPlan, lastChangeAt: null }), true);
});

test('logged reasons describe what actually changed', () => {
  const plan = (reason, stage, detail = null) => ({ stage, stageTargetF: 63, desiredF: 63, reason, detail });
  assert.deepEqual(describeDecision(plan('room', 'deep', 'Room warm at 24.0 °C'), 'falling'), { reason: 'stage', detail: 'Room warm at 24.0 °C' });
  assert.deepEqual(describeDecision(plan('room', 'deep', 'Room warm at 24.0 °C'), 'deep'), { reason: 'room', detail: 'Room warm at 24.0 °C' });
  assert.deepEqual(describeDecision(plan('stage', 'deep'), 'deep'), { reason: 'stage', detail: 'Back to stage target' });
  assert.deepEqual(describeDecision(plan('stage', 'rem'), 'deep'), { reason: 'stage', detail: null });
  assert.deepEqual(describeDecision(plan('wake', 'wake', 'Wake warm-up'), 'wake'), { reason: 'wake', detail: 'Wake warm-up' });
});

beforeEach(() => resetPresence());

test('absence starts when presence is lost', () => {
  assert.equal(getAbsentSince('left', START), null);
  recordPresence('left', true, START);
  recordPresence('left', false, START + minutes(10));
  assert.equal(getAbsentSince('left', START + minutes(30)), START + minutes(10));
});

test('short presence blips do not reset a running absence', () => {
  recordPresence('left', true, START);
  recordPresence('left', false, START + minutes(10));
  recordPresence('left', true, START + minutes(20));
  assert.equal(getAbsentSince('left', START + minutes(21)), START + minutes(10));
  recordPresence('left', false, START + minutes(21));
  assert.equal(getAbsentSince('left', START + minutes(70)), START + minutes(10));
});

test('real presence clears the absence and the next one starts fresh', () => {
  recordPresence('left', true, START);
  recordPresence('left', false, START + minutes(10));
  recordPresence('left', true, START + minutes(20));
  assert.equal(getAbsentSince('left', START + minutes(25)), null);
  recordPresence('left', false, START + minutes(40));
  assert.equal(getAbsentSince('left', START + minutes(41)), START + minutes(40));
  // The other side is tracked separately
  assert.equal(getAbsentSince('right', START + minutes(41)), null);
});
