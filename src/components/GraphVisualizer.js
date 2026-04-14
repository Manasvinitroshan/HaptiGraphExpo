/**
 * GraphVisualizer.js
 *
 * Renders a 2D mathematical graph from structured parser output.
 * Uses react-native-svg for all drawing — no canvas, no WebView.
 *
 * Props:
 *   data: {
 *     points:    [{ x, y, normalizedY? }],
 *     slope:     [{ x, dy }],
 *     curvature: [{ x, d2y }],
 *     features:  { peaks, valleys, zeroCrossings }
 *   }
 *   width?:        number  (defaults to screen width)
 *   height?:       number  (defaults to 300)
 *   showFeatures?: boolean (defaults to true)
 *   showSlope?:    boolean (defaults to false)
 */

import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

// ─── Layout Constants ─────────────────────────────────────────────────────────

const SCREEN_WIDTH  = Dimensions.get('window').width;
const DEFAULT_HEIGHT = 300;

/** Padding (in px) reserved for axes and labels */
const PAD = { top: 20, right: 20, bottom: 36, left: 44 };

// ─── Colour Palette ───────────────────────────────────────────────────────────

const COLORS = {
  background:         '#0f1117',
  axes:               '#3a3f55',
  gridLine:           '#1e2235',
  curve:              '#4f9eff',
  curveGradient:      '#a259ff',
  peak:               '#ff4f4f',
  valley:             '#4faaff',
  zeroCrossing:       '#4fff91',
  asymptoteVertical:  '#ff8f4f',
  asymptoteHorizontal:'#ff4fa0',
  label:              '#7a8099',
  axisLabel:          '#c5cae9',
};

// ─── Scaling Utilities ────────────────────────────────────────────────────────

/**
 * Builds a linear scale function: maps [domainMin, domainMax] → [rangeMin, rangeMax].
 * @returns {(v: number) => number}
 */
function linearScale(domainMin, domainMax, rangeMin, rangeMax) {
  const domainSpan = domainMax - domainMin || 1;
  const rangeSpan  = rangeMax  - rangeMin;
  return (v) => rangeMin + ((v - domainMin) / domainSpan) * rangeSpan;
}

/**
 * Derives domain bounds from point arrays with 5% padding.
 * @param {{ x, y }[]} points
 * @returns {{ xMin, xMax, yMin, yMax }}
 */
function computeDomain(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);

  const yPad = (yMax - yMin) * 0.05 || 1;
  return { xMin, xMax, yMin: yMin - yPad, yMax: yMax + yPad };
}

/**
 * Converts data (x, y) to SVG (px, py) coordinates.
 * @param {{ x, y }[]} points
 * @param {object}     domain   { xMin, xMax, yMin, yMax }
 * @param {number}     svgW     Plot area width  (excluding padding)
 * @param {number}     svgH     Plot area height (excluding padding)
 * @returns {{ px: number, py: number, x: number, y: number }[]}
 */
function toScreenCoords(points, domain, svgW, svgH) {
  const scaleX = linearScale(domain.xMin, domain.xMax, 0, svgW);
  const scaleY = linearScale(domain.yMin, domain.yMax, svgH, 0); // y-axis flipped
  return points.map((p) => ({
    ...p,
    px: scaleX(p.x),
    py: scaleY(p.y),
  }));
}

// ─── SVG Path Builder ─────────────────────────────────────────────────────────

/**
 * Converts screen-space points into an SVG polyline path string.
 * Draws smooth cubic bezier curves using catmull-rom control points.
 * @param {{ px, py }[]} pts
 * @returns {string}
 */
function buildPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${pts[0].px} ${pts[0].py} L ${pts[1].px} ${pts[1].py}`;
  }

  // Catmull-Rom → cubic bezier conversion
  let d = `M ${pts[0].px.toFixed(2)} ${pts[0].py.toFixed(2)}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];

    const cp1x = p1.px + (p2.px - p0.px) / 6;
    const cp1y = p1.py + (p2.py - p0.py) / 6;
    const cp2x = p2.px - (p3.px - p1.px) / 6;
    const cp2y = p2.py - (p3.py - p1.py) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)},`
       +   ` ${cp2x.toFixed(2)} ${cp2y.toFixed(2)},`
       +   ` ${p2.px.toFixed(2)} ${p2.py.toFixed(2)}`;
  }

  return d;
}

// ─── Slope → Stroke Colour ────────────────────────────────────────────────────

/**
 * Maps a normalised slope value (-1…1) to a hex colour.
 * Negative slope → blue-purple; zero → neutral; positive → bright blue.
 */
function slopeToColor(normalizedSlope) {
  const clamped = Math.max(-1, Math.min(1, normalizedSlope ?? 0));
  if (clamped >= 0) {
    const t = clamped;
    const r = Math.round(79  + t * (162 - 79));
    const g = Math.round(158 + t * (89  - 158));
    const b = Math.round(255);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = -clamped;
    const r = Math.round(79  + t * (255 - 79));
    const g = Math.round(158 + t * (79  - 158));
    const b = Math.round(255 + t * (79  - 255));
    return `rgb(${r},${g},${b})`;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Renders grid lines and axis labels */
const Axes = React.memo(({ domain, svgW, svgH, scaleX, scaleY }) => {
  const TICK_COUNT = 5;
  const xTicks = Array.from({ length: TICK_COUNT + 1 }, (_, i) =>
    domain.xMin + (i / TICK_COUNT) * (domain.xMax - domain.xMin)
  );
  const yTicks = Array.from({ length: TICK_COUNT + 1 }, (_, i) =>
    domain.yMin + (i / TICK_COUNT) * (domain.yMax - domain.yMin)
  );

  const yAxisX = scaleX(Math.max(domain.xMin, Math.min(0, domain.xMax)));
  const xAxisY = scaleY(Math.max(domain.yMin, Math.min(0, domain.yMax)));

  return (
    <>
      {/* Grid lines */}
      {xTicks.map((v, i) => (
        <Line key={`gx${i}`}
          x1={scaleX(v)} y1={0} x2={scaleX(v)} y2={svgH}
          stroke={COLORS.gridLine} strokeWidth={1} />
      ))}
      {yTicks.map((v, i) => (
        <Line key={`gy${i}`}
          x1={0} y1={scaleY(v)} x2={svgW} y2={scaleY(v)}
          stroke={COLORS.gridLine} strokeWidth={1} />
      ))}

      {/* X axis */}
      <Line x1={0} y1={xAxisY} x2={svgW} y2={xAxisY}
        stroke={COLORS.axes} strokeWidth={1.5} />
      {/* Y axis */}
      <Line x1={yAxisX} y1={0} x2={yAxisX} y2={svgH}
        stroke={COLORS.axes} strokeWidth={1.5} />

      {/* X tick labels */}
      {xTicks.map((v, i) => (
        <SvgText key={`xl${i}`}
          x={scaleX(v)} y={svgH + 16}
          fontSize={9} fill={COLORS.label} textAnchor="middle">
          {v.toFixed(1)}
        </SvgText>
      ))}
      {/* Y tick labels */}
      {yTicks.map((v, i) => (
        <SvgText key={`yl${i}`}
          x={-6} y={scaleY(v) + 3}
          fontSize={9} fill={COLORS.label} textAnchor="end">
          {v.toFixed(1)}
        </SvgText>
      ))}
    </>
  );
});

/** Renders dashed vertical and horizontal asymptote lines */
const AsymptoteLines = React.memo(({ asymptotes, scaleX, scaleY, svgW, svgH, domain }) => {
  if (!asymptotes) return null;
  const { vertical = [], horizontal = [] } = asymptotes;
  return (
    <>
      {vertical.map((a, i) => {
        const px = scaleX(a.x);
        if (px < 0 || px > svgW) return null;
        return (
          <React.Fragment key={`va${i}`}>
            <Line
              x1={px} y1={0} x2={px} y2={svgH}
              stroke={COLORS.asymptoteVertical}
              strokeWidth={1.5}
              strokeDasharray="5,4"
              opacity={0.8} />
            <SvgText x={px + 4} y={10} fontSize={8} fill={COLORS.asymptoteVertical}>
              x={a.x}
            </SvgText>
          </React.Fragment>
        );
      })}
      {horizontal.map((a, i) => {
        if (a.y < domain.yMin || a.y > domain.yMax) return null;
        const py = scaleY(a.y);
        return (
          <React.Fragment key={`ha${i}`}>
            <Line
              x1={0} y1={py} x2={svgW} y2={py}
              stroke={COLORS.asymptoteHorizontal}
              strokeWidth={1.5}
              strokeDasharray="5,4"
              opacity={0.8} />
            <SvgText x={svgW - 4} y={py - 4} fontSize={8} fill={COLORS.asymptoteHorizontal} textAnchor="end">
              y={a.y}
            </SvgText>
          </React.Fragment>
        );
      })}
    </>
  );
});

/** Renders annotated feature dots with labels */
const FeatureDots = React.memo(({ peaks, valleys, zeroCrossings, scaleX, scaleY }) => (
  <>
    {peaks.map((p, i) => (
      <React.Fragment key={`pk${i}`}>
        <Circle cx={scaleX(p.x)} cy={scaleY(p.y)} r={5}
          fill={COLORS.peak} opacity={0.9} />
        <SvgText x={scaleX(p.x) + 7} y={scaleY(p.y) - 4}
          fontSize={8} fill={COLORS.peak}>
          max
        </SvgText>
      </React.Fragment>
    ))}
    {valleys.map((p, i) => (
      <React.Fragment key={`vl${i}`}>
        <Circle cx={scaleX(p.x)} cy={scaleY(p.y)} r={5}
          fill={COLORS.valley} opacity={0.9} />
        <SvgText x={scaleX(p.x) + 7} y={scaleY(p.y) + 10}
          fontSize={8} fill={COLORS.valley}>
          min
        </SvgText>
      </React.Fragment>
    ))}
    {zeroCrossings.map((p, i) => (
      <Circle key={`zc${i}`}
        cx={scaleX(p.x)} cy={scaleY(0)} r={4}
        fill={COLORS.zeroCrossing} opacity={0.85} />
    ))}
  </>
));

/** Renders slope as a series of coloured line segments */
const SlopeCurve = React.memo(({ screenPts, slopeMap }) => {
  if (!slopeMap || screenPts.length < 2) return null;

  const maxAbs = Math.max(...slopeMap.map((s) => Math.abs(s.dy)), 1);

  return screenPts.slice(0, -1).map((pt, i) => {
    const next      = screenPts[i + 1];
    const slopeEntry = slopeMap[i];
    const normalized = slopeEntry ? slopeEntry.dy / maxAbs : 0;
    return (
      <Line key={`sl${i}`}
        x1={pt.px}    y1={pt.py}
        x2={next.px}  y2={next.py}
        stroke={slopeToColor(normalized)}
        strokeWidth={2.5}
        strokeLinecap="round" />
    );
  });
});

// ─── Tracking Dot ────────────────────────────────────────────────────────────

/** Glowing dot that follows the curve during haptic playback. */
const TrackingDot = React.memo(({ pt }) => (
  <>
    {/* Outer glow ring */}
    <Circle
      cx={pt.px}
      cy={pt.py}
      r={10}
      fill="#ffffff"
      opacity={0.15} />
    {/* Mid ring */}
    <Circle
      cx={pt.px}
      cy={pt.py}
      r={6}
      fill="#ffffff"
      opacity={0.3} />
    {/* Solid core */}
    <Circle
      cx={pt.px}
      cy={pt.py}
      r={4}
      fill="#ffffff"
      opacity={0.95} />
  </>
));

// ─── Main Component ───────────────────────────────────────────────────────────

const GraphVisualizer = React.memo(({
  data,
  currentIndex = -1,
  width        = SCREEN_WIDTH,
  height       = DEFAULT_HEIGHT,
  showFeatures = true,
  showSlope    = false,
}) => {
  // ── Guard ──────────────────────────────────────────────────────────────────
  const hasData = data?.points?.length > 1;

  // ── Derived layout values ──────────────────────────────────────────────────
  const svgW = width  - PAD.left - PAD.right;
  const svgH = height - PAD.top  - PAD.bottom;

  // ── All heavy computation is memoised ──────────────────────────────────────
  const { screenPts, domain, scaleX, scaleY, pathD, slopeMap } = useMemo(() => {
    if (!hasData) return {};

    const domain  = computeDomain(data.points);
    const scaleX  = linearScale(domain.xMin, domain.xMax, 0, svgW);
    const scaleY  = linearScale(domain.yMin, domain.yMax, svgH, 0);
    const screenPts = toScreenCoords(data.points, domain, svgW, svgH);
    const pathD   = buildPath(screenPts);

    // Build a x → slope lookup aligned with screenPts indices
    const slopeMap = data.slope?.length
      ? screenPts.map((pt) => {
          const entry = data.slope.find((s) => Math.abs(s.x - pt.x) < 0.06);
          return entry ?? { dy: 0 };
        })
      : null;

    return { screenPts, domain, scaleX, scaleY, pathD, slopeMap };
  }, [data, svgW, svgH, hasData]);

  // ── Feature screen coordinates (memoised separately) ──────────────────────
  const featureScreenCoords = useMemo(() => {
    if (!hasData || !showFeatures || !data.features) {
      return { peaks: [], valleys: [], zeroCrossings: [] };
    }
    return data.features;   // passed directly — scaleX/scaleY handle projection
  }, [data, hasData, showFeatures]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <View style={[styles.container, { width, height }]}>
        <Text style={styles.emptyText}>No graph data</Text>
      </View>
    );
  }

  // ── Legend ─────────────────────────────────────────────────────────────────
  const peakCount  = data.features?.peaks?.length ?? 0;
  const valleyCount = data.features?.valleys?.length ?? 0;
  const zcCount    = data.features?.zeroCrossings?.length ?? 0;
  const vaCount    = data.features?.asymptotes?.vertical?.length ?? 0;
  const haCount    = data.features?.asymptotes?.horizontal?.length ?? 0;

  return (
    <View style={[styles.container, { width, height: height + 32 }]}>
      <Svg
        width={width}
        height={height}
        style={styles.svg}>

        <Defs>
          <LinearGradient id="curveGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0"   stopColor={COLORS.curve}         stopOpacity="1" />
            <Stop offset="1"   stopColor={COLORS.curveGradient} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* Background */}
        <Rect x={0} y={0} width={width} height={height}
          fill={COLORS.background} rx={12} />

        {/* Plot area — offset by padding */}
        <G transform={`translate(${PAD.left}, ${PAD.top})`}>

          {/* Grid + Axes */}
          <Axes
            domain={domain}
            svgW={svgW}
            svgH={svgH}
            scaleX={scaleX}
            scaleY={scaleY} />

          {/* Curve — slope-coloured segments OR gradient path */}
          {showSlope && slopeMap ? (
            <SlopeCurve screenPts={screenPts} slopeMap={slopeMap} />
          ) : (
            <Path
              d={pathD}
              stroke="url(#curveGrad)"
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round" />
          )}

          {/* Asymptote lines */}
          {showFeatures && (
            <AsymptoteLines
              asymptotes={data.features?.asymptotes}
              scaleX={scaleX}
              scaleY={scaleY}
              svgW={svgW}
              svgH={svgH}
              domain={domain} />
          )}

          {/* Feature annotations */}
          {showFeatures && (
            <FeatureDots
              peaks={featureScreenCoords.peaks}
              valleys={featureScreenCoords.valleys}
              zeroCrossings={featureScreenCoords.zeroCrossings}
              scaleX={scaleX}
              scaleY={scaleY} />
          )}

          {/* Tracking dot — moves along curve during haptic playback */}
          {currentIndex >= 0 && screenPts?.[currentIndex] && (
            <TrackingDot pt={screenPts[currentIndex]} />
          )}
        </G>
      </Svg>

      {/* Legend row */}
      {showFeatures && (
        <View style={styles.legend}>
          <LegendItem color={COLORS.peak}                label={`${peakCount} peak${peakCount !== 1 ? 's' : ''}`} />
          <LegendItem color={COLORS.valley}              label={`${valleyCount} valle${valleyCount !== 1 ? 'ys' : 'y'}`} />
          <LegendItem color={COLORS.zeroCrossing}        label={`${zcCount} zero crossing${zcCount !== 1 ? 's' : ''}`} />
          {vaCount > 0 && <LegendItem color={COLORS.asymptoteVertical}   label={`${vaCount} vert. asymptote${vaCount !== 1 ? 's' : ''}`} dashed />}
          {haCount > 0 && <LegendItem color={COLORS.asymptoteHorizontal} label={`${haCount} horiz. asymptote${haCount !== 1 ? 's' : ''}`} dashed />}
        </View>
      )}
    </View>
  );
});

// ─── Legend Item ──────────────────────────────────────────────────────────────

const LegendItem = ({ color, label, dashed = false }) => (
  <View style={styles.legendItem}>
    {dashed ? (
      <View style={[styles.legendDash, { borderColor: color }]} />
    ) : (
      <View style={[styles.legendDot, { backgroundColor: color }]} />
    )}
    <Text style={styles.legendLabel}>{label}</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
  },
  svg: {
    borderRadius: 12,
  },
  emptyText: {
    color: COLORS.label,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendDash: {
    width: 14,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  legendLabel: {
    color: COLORS.label,
    fontSize: 11,
  },
});

export default GraphVisualizer;
