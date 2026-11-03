import { useMemo } from 'react';
import moment from 'moment-timezone';
import { Box, Typography, useTheme } from '@mui/material';
import { useResizeDetector } from 'react-resize-detector';
import type { AutopilotDecision, SessionDetail } from '@api/autopilot.ts';
import { farenheitToCelcius } from '@lib/temperatureConversions.ts';
import { formatClock, formatTemp, REASON_STYLES, SHORT_STAGE_LABELS } from './autopilotFormat.ts';
import Marker from './ChartMarker.tsx';

type NightChartProps = {
  detail: SessionDetail;
  isCelsius: boolean;
  now: number;
};

const HEIGHT = 240;
const MARGIN = { top: 26, right: 12, bottom: 26, left: 38 };

type Point = { time: number; value: number };

// Builds an SVG path that holds each value until the next point (a step chart)
const stepPath = (points: Point[], x: (time: number) => number, y: (value: number) => number) =>
  points.map((point, index) => {
    const command = index === 0 ? `M${x(point.time)},${y(point.value)}` : `H${x(point.time)}V${y(point.value)}`;
    return command;
  }).join('');

const decisionTooltip = (decision: AutopilotDecision, isCelsius: boolean) =>
  `${formatClock(decision.timestamp)} · ${formatTemp(decision.setF, isCelsius)} · ${decision.detail ?? REASON_STYLES[decision.reason].label}`;

export default function NightChart({ detail, isCelsius, now }: NightChartProps) {
  const { width = 340, ref } = useResizeDetector();
  const theme = useTheme();
  const { session, decisions } = detail;
  const endTime = session.endedAt ?? now;
  const toUnit = (temperatureF: number) => (isCelsius ? farenheitToCelcius(temperatureF) : temperatureF);

  const chart = useMemo(() => {
    const setPoints: Point[] = decisions.map(decision => ({ time: decision.timestamp, value: toUnit(decision.setF) }));
    const targetPoints: Point[] = decisions.map(decision => ({ time: decision.timestamp, value: toUnit(decision.targetF) }));
    if (setPoints.length > 0) {
      setPoints.push({ time: endTime, value: setPoints[setPoints.length - 1].value });
      targetPoints.push({ time: endTime, value: targetPoints[targetPoints.length - 1].value });
    }
    const values = [...setPoints, ...targetPoints].map(point => point.value);
    const padding = isCelsius ? 1 : 2;
    const minValue = Math.floor(Math.min(...values) - padding);
    const maxValue = Math.ceil(Math.max(...values) + padding);
    // Vertical guides where the stage changed
    const stageChanges = decisions.filter((decision, index) => index > 0 && decision.stage !== decisions[index - 1].stage);
    // Ramps step one degree at a time, so only their first step gets a marker
    const markers = decisions.filter((decision, index) => {
      const isRampStep = decision.reason === 'wake' || decision.reason === 'schedule';
      return index === 0 || !isRampStep || decision.stage !== decisions[index - 1].stage;
    });
    return { setPoints, targetPoints, minValue, maxValue, stageChanges, markers };
  }, [decisions, endTime, isCelsius]);

  if (decisions.length === 0) {
    return (
      <Box ref={ ref } sx={ { py: 4, textAlign: 'center' } }>
        <Typography variant="body2" sx={ { color: 'text.secondary' } }>No decisions logged for this session yet.</Typography>
      </Box>
    );
  }

  const innerWidth = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const span = Math.max(1, endTime - session.startedAt);
  const x = (time: number) => MARGIN.left + ((time - session.startedAt) / span) * innerWidth;
  const y = (value: number) => MARGIN.top + (1 - (value - chart.minValue) / (chart.maxValue - chart.minValue)) * innerHeight;

  // Labels near the right edge are drawn to the left of their line so they aren't cut off
  const isNearRightEdge = (time: number) => x(time) > MARGIN.left + innerWidth - 40;
  const yTicks =Array.from({ length: 4 }, (_, index) =>
    Math.round(chart.minValue + ((chart.maxValue - chart.minValue) * index) / 3));
  const xTicks = Array.from({ length: 4 }, (_, index) => session.startedAt + (span * index) / 3);
  const setPath = stepPath(chart.setPoints, x, y);
  const areaPath = `${setPath}V${MARGIN.top + innerHeight}H${x(session.startedAt)}Z`;
  const gridColor = theme.palette.divider;
  const mutedColor = theme.palette.text.secondary;
  const lineColor = theme.palette.text.primary;

  return (
    <Box ref={ ref } sx={ { width: '100%' } }>
      <svg
        width={ width }
        height={ HEIGHT }
        role="img"
        aria-label={ `Bed temperature from ${formatClock(session.startedAt)} to ${formatClock(endTime)}, ${decisions.length} decisions` }
      >
        { yTicks.map(tick => (
          <g key={ `y-${tick}` }>
            <line x1={ MARGIN.left } x2={ MARGIN.left + innerWidth } y1={ y(tick) } y2={ y(tick) } stroke={ gridColor }/>
            <text x={ MARGIN.left - 6 } y={ y(tick) + 4 } fontSize={ 10 } fill={ mutedColor } textAnchor="end">{ tick }°</text>
          </g>
        )) }
        { xTicks.map(tick => (
          <text key={ `x-${tick}` } x={ x(tick) } y={ HEIGHT - 6 } fontSize={ 10 } fill={ mutedColor } textAnchor="middle">
            { moment.unix(tick).format('HH:mm') }
          </text>
        )) }
        { chart.stageChanges.map(decision => (
          <g key={ `stage-${decision.id}` }>
            <line
              x1={ x(decision.timestamp) }
              x2={ x(decision.timestamp) }
              y1={ MARGIN.top - 8 }
              y2={ MARGIN.top + innerHeight }
              stroke={ theme.palette.info.main }
              strokeOpacity={ 0.5 }
            />
            <text
              x={ x(decision.timestamp) + (isNearRightEdge(decision.timestamp) ? -4 : 4) }
              y={ MARGIN.top - 12 }
              fontSize={ 10 }
              fill={ lineColor }
              textAnchor={ isNearRightEdge(decision.timestamp) ? 'end' : 'start' }
            >
              { SHORT_STAGE_LABELS[decision.stage] }
            </text>
          </g>
        )) }
        <path d={ areaPath } fill={ theme.palette.info.main } fillOpacity={ 0.1 }/>
        <path d={ stepPath(chart.targetPoints, x, y) } fill="none" stroke={ mutedColor } strokeWidth={ 1.3 } strokeDasharray="4 4"/>
        <path d={ setPath } fill="none" stroke={ lineColor } strokeWidth={ 2 } strokeLinejoin="round"/>
        { chart.markers.map(decision => (
          <g key={ decision.id }>
            <title>{ decisionTooltip(decision, isCelsius) }</title>
            <Marker decision={ decision } cx={ x(decision.timestamp) } cy={ y(toUnit(decision.setF)) }/>
          </g>
        )) }
      </svg>
      <Box sx={ { display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1, fontSize: 12, color: 'text.secondary' } }>
        <Box component="span" sx={ { display: 'flex', alignItems: 'center', gap: 0.5 } }>
          <Box component="span" sx={ { width: 14, borderTop: '1.5px dashed', borderColor: 'text.secondary' } }/>Schedule
        </Box>
        <Box component="span" sx={ { display: 'flex', alignItems: 'center', gap: 0.5 } }>
          <Box component="span" sx={ { width: 14, borderTop: '2px solid', borderColor: 'text.primary' } }/>Set temperature
        </Box>
        { Object.entries(REASON_STYLES).filter(([reason]) => reason !== 'stage').map(([reason, style]) => (
          <Box component="span" key={ reason } sx={ { display: 'flex', alignItems: 'center', gap: 0.5 } }>
            <svg width={ 12 } height={ 12 } aria-hidden="true">
              <Marker decision={ { reason } as AutopilotDecision } cx={ 6 } cy={ 6 }/>
            </svg>
            { style.label }
          </Box>
        )) }
      </Box>
    </Box>
  );
}
