"""Coverage for averaging hub and cover ambient readings into 5-minute reports."""

from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

biometrics_path = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(biometrics_path))
sys.path.insert(0, str(biometrics_path / 'stream'))

with patch.dict(sys.modules, {'get_logger': Mock(get_logger=Mock(return_value=Mock()))}):
    from ambient_reporter import AmbientReporter, centi_to_celsius, side_body_celsius, to_humidity_percent

NOW = 1762200000


def bed_temp(amb=2200, hu=4800, left=(3100, 3200, 3300), right=(2900, 3000, 3100), ts=NOW):
    return {
        'type': 'bedTemp', 'ts': ts, 'amb': amb, 'mcu': 3500, 'hu': hu, 'seq': 1,
        'left': {'side': 0, 'out': left[0], 'cen': left[1], 'in': left[2]},
        'right': {'side': 1, 'out': right[0], 'cen': right[1], 'in': right[2]},
    }


def frz_temp(amb=2400, ts=NOW):
    return {'type': 'frzTemp', 'ts': ts, 'amb': amb, 'hs': 3168, 'left': 1975, 'right': 1981, 'seq': 2}


class AmbientReporterTest(unittest.TestCase):
    def setUp(self):
        self.posted = []
        self.reporter = AmbientReporter(post=self.posted.append, interval_seconds=300, run_in_thread=False)

    def test_conversions(self):
        self.assertEqual(centi_to_celsius(2168), 21.68)
        self.assertIsNone(centi_to_celsius(9000))
        self.assertIsNone(centi_to_celsius('x'))
        self.assertEqual(to_humidity_percent(4850), 48.5)
        self.assertEqual(to_humidity_percent(48), 48.0)
        self.assertAlmostEqual(side_body_celsius({'out': 3100, 'cen': 3200, 'in': 3300}), 32.0)
        self.assertIsNone(side_body_celsius(None))

    def test_averages_and_posts_after_interval(self):
        self.reporter.add_record(bed_temp(amb=2200), now=NOW)
        self.reporter.add_record(frz_temp(amb=2400), now=NOW + 60)
        self.reporter.add_record(bed_temp(amb=2300), now=NOW + 120)
        self.assertEqual(self.posted, [])

        self.reporter.add_record(frz_temp(amb=2500, ts=NOW + 300), now=NOW + 300)
        self.assertEqual(len(self.posted), 1)
        report = self.posted[0]
        self.assertEqual(report['timestamp'], NOW)
        self.assertEqual(report['coverAmbC'], 22.5)
        self.assertEqual(report['hubAmbC'], 24.5)
        self.assertEqual(report['humidity'], 48.0)
        self.assertEqual(report['leftBodyC'], 32.0)
        self.assertEqual(report['rightBodyC'], 30.0)

    def test_ignores_other_types_and_old_records(self):
        self.reporter.add_record({'type': 'piezo-dual', 'ts': NOW}, now=NOW)
        self.reporter.add_record(frz_temp(ts=NOW - 3600), now=NOW)
        self.assertIsNone(self.reporter.bucket_start)

    def test_drops_implausible_values(self):
        self.reporter.add_record(frz_temp(amb=9999), now=NOW)
        self.reporter.add_record(frz_temp(amb=-5000, ts=NOW + 300), now=NOW + 300)
        # Every value was implausible, so nothing is reported
        self.assertEqual(self.posted, [])


if __name__ == '__main__':
    unittest.main()
