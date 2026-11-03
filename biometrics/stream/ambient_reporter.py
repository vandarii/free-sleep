"""
Averages the Pod's ambient sensor records and reports them to the server for Autopilot.

Two raw record types carry ambient data (values are hundredths of a degree Celsius):
- frzTemp (hub, under the bed): `amb` is the hub's ambient temperature
- bedTemp (cover, on the mattress): `amb` ambient, `hu` humidity, and per side
  `out` / `cen` / `in` temperature points

Readings are averaged into 5-minute buckets and posted to /api/autopilot/ambient.
"""

import json
import threading
import time
import urllib.error
import urllib.request
from typing import Callable, Dict, List, Optional

from get_logger import get_logger

logger = get_logger('free-sleep-stream')

AMBIENT_RECORD_TYPES = ('bedTemp', 'frzTemp')
AMBIENT_SUBJECTS = ('raw.sens.bedtemp', 'raw.frz.temp')
AMBIENT_API_URL = 'http://127.0.0.1:3000/api/autopilot/ambient'
REPORT_INTERVAL_SECONDS = 300
MAX_RECORD_AGE_SECONDS = 600

# Readings outside these ranges are sensor glitches and are dropped
MIN_PLAUSIBLE_C = -10.0
MAX_PLAUSIBLE_C = 60.0


def centi_to_celsius(value) -> Optional[float]:
    """Converts a hundredths-of-a-degree reading to °C, or None when missing or implausible."""
    if not isinstance(value, (int, float)):
        return None
    celsius = value / 100
    if celsius < MIN_PLAUSIBLE_C or celsius > MAX_PLAUSIBLE_C:
        return None
    return celsius


def to_humidity_percent(value) -> Optional[float]:
    """Humidity is reported in hundredths of a percent on some firmware and whole percent on others."""
    if not isinstance(value, (int, float)):
        return None
    percent = value / 100 if value > 100 else float(value)
    if percent < 0 or percent > 100:
        return None
    return percent


def side_body_celsius(channel) -> Optional[float]:
    """Average of the out / center / in temperature points for one side of the cover."""
    if not isinstance(channel, dict):
        return None
    points = [centi_to_celsius(channel.get(key)) for key in ('out', 'cen', 'in')]
    valid = [point for point in points if point is not None]
    if not valid:
        return None
    return sum(valid) / len(valid)


def post_reading(payload: dict):
    try:
        request = urllib.request.Request(
            AMBIENT_API_URL,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status >= 300:
                logger.warning(f'Ambient API returned status {response.status}')
    except urllib.error.URLError as error:
        logger.warning(f'Could not post ambient reading: {error.reason}')
    except Exception as error:
        logger.error(f'Error posting ambient reading: {error}')


class AmbientReporter:
    """Collects ambient readings and posts their averages once per interval."""

    def __init__(self, post: Callable[[dict], None] = post_reading, interval_seconds: int = REPORT_INTERVAL_SECONDS,
                 run_in_thread: bool = True):
        self.post = post
        self.interval_seconds = interval_seconds
        self.run_in_thread = run_in_thread
        self.bucket_start: Optional[float] = None
        self.lock = threading.Lock()
        self.samples: Dict[str, List[float]] = {}
        self.reset()

    def reset(self):
        self.samples = {
            'hubAmbC': [],
            'coverAmbC': [],
            'humidity': [],
            'leftBodyC': [],
            'rightBodyC': [],
        }

    def _append(self, key: str, value: Optional[float]):
        if value is not None:
            self.samples[key].append(value)

    def add_record(self, record: dict, now: Optional[float] = None):
        """Adds one decoded bedTemp or frzTemp record, flushing when the interval has passed."""
        record_type = record.get('type')
        if record_type not in AMBIENT_RECORD_TYPES:
            return
        now = time.time() if now is None else now
        # Skip backlog when a RAW file is read from the start, the bucket would get the wrong time
        record_time = record.get('ts')
        if isinstance(record_time, (int, float)) and now - record_time > MAX_RECORD_AGE_SECONDS:
            return
        with self.lock:
            if self.bucket_start is None:
                self.bucket_start = now
            if record_type == 'frzTemp':
                self._append('hubAmbC', centi_to_celsius(record.get('amb')))
            else:
                self._append('coverAmbC', centi_to_celsius(record.get('amb')))
                self._append('humidity', to_humidity_percent(record.get('hu')))
                self._append('leftBodyC', side_body_celsius(record.get('left')))
                self._append('rightBodyC', side_body_celsius(record.get('right')))
            payload = self._take_payload_if_due(now)
        if payload is not None:
            self._send(payload)

    def _take_payload_if_due(self, now: float) -> Optional[dict]:
        if self.bucket_start is None or now - self.bucket_start < self.interval_seconds:
            return None
        payload = {'timestamp': int(self.bucket_start)}
        for key, values in self.samples.items():
            payload[key] = round(sum(values) / len(values), 2) if values else None
        self.bucket_start = now
        self.reset()
        if all(payload[key] is None for key in self.samples):
            return None
        return payload

    def _send(self, payload: dict):
        if self.run_in_thread:
            threading.Thread(target=self.post, args=(payload,), daemon=True).start()
        else:
            self.post(payload)
