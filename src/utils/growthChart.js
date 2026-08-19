export const GROWTH_METRICS = [
  {
    key: 'heightCm',
    label: '身高',
    unit: 'cm',
    color: '#3b82f6',
    fill: 'rgba(59, 130, 246, 0.14)',
    minimumSpan: 5
  },
  {
    key: 'weightKg',
    label: '体重',
    unit: 'kg',
    color: '#10b981',
    fill: 'rgba(16, 185, 129, 0.14)',
    minimumSpan: 2
  },
  {
    key: 'headCircumferenceCm',
    label: '头围',
    unit: 'cm',
    color: '#f59e0b',
    fill: 'rgba(245, 158, 11, 0.14)',
    minimumSpan: 2
  }
]

const CHART_WIDTH = 760
const CHART_HEIGHT = 280
const PLOT_LEFT = 54
const PLOT_RIGHT = 18
const PLOT_TOP = 18
const PLOT_BOTTOM = 42
const GRID_LINE_COUNT = 5
const MAX_X_LABELS = 5

function roundTo(value, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function formatDateLabel(value) {
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function selectLabelIndexes(length) {
  if (length <= MAX_X_LABELS) {
    return Array.from({ length }, (_, index) => index)
  }
  const indexes = new Set([0, length - 1])
  for (let step = 1; step < MAX_X_LABELS - 1; step += 1) {
    indexes.add(Math.round((length - 1) * step / (MAX_X_LABELS - 1)))
  }
  return [...indexes].sort((a, b) => a - b)
}

function getMetric(metricKey) {
  return GROWTH_METRICS.find(metric => metric.key === metricKey) || GROWTH_METRICS[0]
}

export function buildGrowthChartModel(records, metricKey) {
  const metric = getMetric(metricKey)
  const measurements = records
    .filter(record => Number.isFinite(record[metric.key]))
    .map(record => ({
      id: record.id,
      measuredAt: record.measuredAt,
      timestamp: Date.parse(`${record.measuredAt}T00:00:00Z`),
      value: record[metric.key]
    }))
    .sort((a, b) => a.timestamp - b.timestamp)

  if (!measurements.length) {
    return {
      metric,
      points: [],
      linePath: '',
      areaPath: '',
      yTicks: [],
      xLabels: [],
      viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`
    }
  }

  const values = measurements.map(measurement => measurement.value)
  const rawMinimum = Math.min(...values)
  const rawMaximum = Math.max(...values)
  const valueSpan = Math.max(rawMaximum - rawMinimum, metric.minimumSpan)
  const padding = valueSpan * 0.18
  const yMinimum = Math.max(0, rawMinimum - padding)
  const yMaximum = rawMaximum + padding
  const ySpan = yMaximum - yMinimum
  const timeMinimum = measurements[0].timestamp
  const timeMaximum = measurements[measurements.length - 1].timestamp
  const timeSpan = timeMaximum - timeMinimum
  const plotWidth = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT
  const plotHeight = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM

  const points = measurements.map((measurement, index) => {
    const xRatio = timeSpan === 0
      ? 0.5
      : (measurement.timestamp - timeMinimum) / timeSpan
    const yRatio = (measurement.value - yMinimum) / ySpan
    return {
      ...measurement,
      x: roundTo(PLOT_LEFT + xRatio * plotWidth, 2),
      y: roundTo(PLOT_TOP + (1 - yRatio) * plotHeight, 2),
      valueLabel: `${roundTo(measurement.value)} ${metric.unit}`,
      sequence: index + 1
    }
  })

  const linePath = points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  )).join(' ')
  const plotBottom = CHART_HEIGHT - PLOT_BOTTOM
  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x} ${plotBottom} L ${points[0].x} ${plotBottom} Z`
    : ''
  const yTicks = Array.from({ length: GRID_LINE_COUNT }, (_, index) => {
    const ratio = index / (GRID_LINE_COUNT - 1)
    return {
      y: roundTo(PLOT_TOP + ratio * plotHeight, 2),
      value: roundTo(yMaximum - ratio * ySpan)
    }
  })
  const xLabels = selectLabelIndexes(points.length).map(index => ({
    x: points[index].x,
    label: formatDateLabel(points[index].measuredAt)
  }))

  return {
    metric,
    points,
    linePath,
    areaPath,
    yTicks,
    xLabels,
    viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`
  }
}

export function getLatestMetricSummary(records, metricKey) {
  const metric = getMetric(metricKey)
  const measurements = records
    .filter(record => Number.isFinite(record[metric.key]))
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const latest = measurements.at(-1)
  const previous = measurements.at(-2)
  return {
    metric,
    latestValue: latest?.[metric.key] ?? null,
    latestDate: latest?.measuredAt ?? null,
    change: latest && previous
      ? roundTo(latest[metric.key] - previous[metric.key])
      : null
  }
}
