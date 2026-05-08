import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import Svg, { Line, Rect } from "react-native-svg";

import { appTheme } from "../theme/designSystem";
import {
  buildDailyRanges,
  buildMonthlyRanges,
  buildWeeklyRanges,
  buildYearlyRanges,
  loadStepsForRanges,
  type StepHistoryPoint,
} from "../services/stepHistory";
import { styles } from "./StepsHistoryModal.styles";

type Timeframe = "days" | "weeks" | "months" | "years";

type StepsHistoryModalProps = {
  visible: boolean;
  onClose: () => void;
  dailyGoal: number;
  userId: string;
};

type StepBarPoint = {
  steps: number;
  isGoalMet: boolean;
  target?: number | null;
};

const CHUNK_SIZE: Record<Timeframe, number> = {
  days: 7,
  weeks: 6,
  months: 6,
  years: 3,
};

const POINT_SPACING = 44;
const MIN_POINT_SPACING = 28;
const MAX_POINT_SPACING = 56;
const CHART_HEIGHT = 180;
const CHART_PADDING = 18;

export function StepBarChart({
  points,
  width,
  height,
  goalLineValue,
  pointSpacing = POINT_SPACING,
  padding = CHART_PADDING,
}: {
  points: StepBarPoint[];
  width: number;
  height: number;
  goalLineValue?: number | null;
  pointSpacing?: number;
  padding?: number;
}) {
  if (!points.length) {
    return null;
  }

  const achievedColor = appTheme.colors.primary;
  const missedColor = appTheme.colors.primary;
  const targetBarColor = appTheme.colors.border;
  const gridColor = appTheme.colors.border;
  const hasSteps = points.some((point) => point.steps > 0);
  const maxStepValue = Math.max(1, ...points.map((point) => point.steps));
  const maxTargetValue = Math.max(
    1,
    ...points.map((point) =>
      typeof point.target === "number" && Number.isFinite(point.target)
        ? point.target
        : 0,
    ),
  );
  const maxValue = hasSteps ? maxStepValue : maxTargetValue;
  const clampedGoalLineValue =
    typeof goalLineValue === "number"
      ? Math.min(goalLineValue, maxValue)
      : null;
  const chartHeight = height - padding * 2;

  const yForValue = (value: number) => {
    const ratio = value / maxValue;
    return padding + (1 - ratio) * chartHeight;
  };

  const xForIndex = (index: number) => padding + index * pointSpacing;
  const maxBarWidth = Math.max(8, pointSpacing - 6);
  const barWidth = Math.max(8, Math.min(pointSpacing * 0.7, maxBarWidth));

  return (
    <Svg width={width} height={height}>
      <Line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke={gridColor}
        strokeWidth={1}
      />

      {typeof clampedGoalLineValue === "number" ? (
        <Line
          x1={padding}
          y1={yForValue(clampedGoalLineValue)}
          x2={width - padding}
          y2={yForValue(clampedGoalLineValue)}
          stroke={appTheme.colors.accent}
          strokeWidth={1}
          strokeDasharray="5,4"
        />
      ) : null}

      {points.map((point, index) => {
        const targetValue =
          typeof point.target === "number" && Number.isFinite(point.target)
            ? point.target
            : 0;
        const targetHeight = Math.max(0, chartHeight - (yForValue(targetValue) - padding));
        const targetY = padding + (chartHeight - targetHeight);
        const barHeight = Math.max(0, chartHeight - (yForValue(point.steps) - padding));
        const barX = xForIndex(index) - barWidth / 2;
        const barY = padding + (chartHeight - barHeight);
        const radius = Math.min(appTheme.radii.sm, barWidth / 2);

        return (
          <React.Fragment key={`bar-${index}`}>
            {!hasSteps && targetHeight > 0 ? (
              <Rect
                x={barX}
                y={targetY}
                width={barWidth}
                height={targetHeight}
                rx={radius}
                ry={radius}
                fill={targetBarColor}
              />
            ) : null}
            {barHeight > 0 ? (
              <Rect
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                rx={radius}
                ry={radius}
                fill={point.isGoalMet ? achievedColor : missedColor}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export default function StepsHistoryModal({
  visible,
  onClose,
  dailyGoal,
  userId,
}: StepsHistoryModalProps) {
  const [activeRange, setActiveRange] = useState<Timeframe>("days");
  const [chartContainerWidth, setChartContainerWidth] = useState(0);
  const [pointsByRange, setPointsByRange] = useState<
    Record<Timeframe, Record<number, StepHistoryPoint[]>>
  >({
    days: {},
    weeks: {},
    months: {},
    years: {},
  });
  const [activeOffsets, setActiveOffsets] = useState<Record<Timeframe, number>>({
    days: 0,
    weeks: 0,
    months: 0,
    years: 0,
  });
  const [loadingRanges, setLoadingRanges] = useState<Record<Timeframe, boolean>>({
    days: false,
    weeks: false,
    months: false,
    years: false,
  });

  const resetRanges = useCallback(() => {
    setPointsByRange({
      days: {},
      weeks: {},
      months: {},
      years: {},
    });
    setActiveOffsets({
      days: 0,
      weeks: 0,
      months: 0,
      years: 0,
    });
    setLoadingRanges({
      days: false,
      weeks: false,
      months: false,
      years: false,
    });
  }, []);

  useEffect(() => {
    if (visible) {
      setActiveRange("days");
      resetRanges();
    }
  }, [resetRanges, visible, dailyGoal, userId]);

  const loadChunk = useCallback(
    async (range: Timeframe, offset: number) => {
      if (loadingRanges[range]) {
        return false;
      }

      if (pointsByRange[range][offset]) {
        return true;
      }

      setLoadingRanges((prev) => ({ ...prev, [range]: true }));

      try {
        const now = new Date();
        const count = CHUNK_SIZE[range];
        const ranges =
          range === "days"
            ? buildDailyRanges({ endDate: now, count, dailyGoal, offset })
            : range === "weeks"
              ? buildWeeklyRanges({ endDate: now, count, dailyGoal, offset })
              : range === "months"
                ? buildMonthlyRanges({ endDate: now, count, dailyGoal, offset })
                : buildYearlyRanges({ endDate: now, count, dailyGoal, offset });

        const points = await loadStepsForRanges(ranges, { uid: userId });

        setPointsByRange((prev) => ({
          ...prev,
          [range]: {
            ...prev[range],
            [offset]: points,
          },
        }));

        return true;
      } finally {
        setLoadingRanges((prev) => ({ ...prev, [range]: false }));
      }
    },
    [dailyGoal, loadingRanges, pointsByRange, userId],
  );

  const activeOffset = activeOffsets[activeRange];
  const activePoints = pointsByRange[activeRange][activeOffset] ?? [];
  const isRangeLoading = loadingRanges[activeRange];
  const canGoNext = activeOffset > 0;

  useEffect(() => {
    if (!visible) {
      return;
    }

    void loadChunk(activeRange, activeOffset);
  }, [activeOffset, activeRange, loadChunk, visible]);

  const navigateOffset = useCallback(
    (nextOffset: number) => {
      if (nextOffset < 0) {
        return;
      }

      void (async () => {
        const loaded = await loadChunk(activeRange, nextOffset);
        if (loaded) {
          setActiveOffsets((prev) => ({
            ...prev,
            [activeRange]: nextOffset,
          }));
        }
      })();
    },
    [activeRange, loadChunk],
  );

  const handlePrev = useCallback(() => {
    navigateOffset(activeOffset + 1);
  }, [activeOffset, navigateOffset]);

  const handleNext = useCallback(() => {
    if (!canGoNext) {
      return;
    }

    navigateOffset(activeOffset - 1);
  }, [activeOffset, canGoNext, navigateOffset]);

  const orderedPoints = useMemo(() => activePoints.slice().reverse(), [activePoints]);
  const chartWidth = useMemo(() => {
    const pointCount = Math.max(1, orderedPoints.length);
    const dataWidth = CHART_PADDING * 2 + (pointCount - 1) * POINT_SPACING;
    const minWidth = Math.max(240, dataWidth);
    return chartContainerWidth > 0 ? chartContainerWidth : minWidth;
  }, [chartContainerWidth, orderedPoints.length]);
  const pointSpacing = useMemo(() => {
    const pointCount = Math.max(1, orderedPoints.length);
    if (pointCount <= 1) {
      return POINT_SPACING;
    }

    const available = Math.max(0, chartWidth - CHART_PADDING * 2);
    const stretched = available / (pointCount - 1);
    return Math.min(MAX_POINT_SPACING, Math.max(MIN_POINT_SPACING, stretched));
  }, [chartWidth, orderedPoints.length]);
  const labelWidth = Math.max(18, Math.round(pointSpacing));

  const chartPoints: StepBarPoint[] = useMemo(
    () =>
      orderedPoints.map((point) => ({
        steps: point.steps,
        isGoalMet: point.isGoalMet,
        target: point.target,
      })),
    [orderedPoints],
  );

  const goalLineValue = activeRange === "days" ? dailyGoal : null;

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={styles.modalDismissLayer} onPress={onClose} />

        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Steps history</Text>
            <Pressable
              style={styles.modalCloseButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close steps history"
            >
              <X size={16} color={appTheme.colors.textSecondary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.rangeRow}>
            {([
              { key: "days", label: "Days" },
              { key: "weeks", label: "Weeks" },
              { key: "months", label: "Months" },
              { key: "years", label: "Years" },
            ] as const).map((range) => {
              const isActive = activeRange === range.key;
              return (
                <Pressable
                  key={range.key}
                  style={[styles.rangeChip, isActive ? styles.rangeChipActive : null]}
                  onPress={() => {
                    setActiveRange(range.key);
                    setActiveOffsets((prev) => ({
                      ...prev,
                      [range.key]: 0,
                    }));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${range.label} chart`}
                >
                  <Text
                    style={[
                      styles.rangeChipText,
                      isActive ? styles.rangeChipTextActive : null,
                    ]}
                  >
                    {range.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.modalMeta}>
            Goal: {dailyGoal.toLocaleString()} steps per day
          </Text>

          <View
            style={styles.chartScroll}
            onLayout={({ nativeEvent }) => {
              const nextWidth = Math.round(nativeEvent.layout.width);
              if (nextWidth > 0 && nextWidth !== chartContainerWidth) {
                setChartContainerWidth(nextWidth);
              }
            }}
          >
            <Pressable
              style={[
                styles.chartNavButton,
                styles.chartNavButtonLeft,
                isRangeLoading ? styles.chartNavButtonDisabled : null,
              ]}
              onPress={handlePrev}
              disabled={isRangeLoading}
              accessibilityRole="button"
              accessibilityLabel="Show previous bars"
            >
              <ChevronLeft size={16} color={appTheme.colors.primary} strokeWidth={2.4} />
            </Pressable>

            <Pressable
              style={[
                styles.chartNavButton,
                styles.chartNavButtonRight,
                !canGoNext || isRangeLoading ? styles.chartNavButtonDisabled : null,
              ]}
              onPress={handleNext}
              disabled={!canGoNext || isRangeLoading}
              accessibilityRole="button"
              accessibilityLabel="Show next bars"
            >
              <ChevronRight size={16} color={appTheme.colors.primary} strokeWidth={2.4} />
            </Pressable>

            <View style={styles.chartInner}>
              <View style={{ width: chartWidth, height: CHART_HEIGHT }}>
                <StepBarChart
                  points={chartPoints}
                  width={chartWidth}
                  height={CHART_HEIGHT}
                  goalLineValue={goalLineValue}
                  pointSpacing={pointSpacing}
                />
              </View>
              <View
                style={[
                  styles.chartLabelsRow,
                  {
                    width: chartWidth,
                    position: "relative",
                    minHeight: 18,
                  },
                ]}
              >
                {orderedPoints.map((point, index) => {
                  const center = CHART_PADDING + index * pointSpacing;
                  const boxWidth = 80;
                  const left = center - boxWidth / 2;

                  return (
                    <Text
                      key={`label-${point.key}`}
                      style={[
                        styles.chartLabel,
                        {
                          position: "absolute",
                          left,
                          width: boxWidth,
                          textAlign: "center",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {point.label}
                    </Text>
                  );
                })}
              </View>
            </View>
          </View>

          {/* {loadingRanges[activeRange] ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={appTheme.colors.primary} />
              <Text style={styles.loadingText}>Loading more steps...</Text>
            </View>
          ) : null} */}

          {!loadingRanges[activeRange] && activePoints.length === 0 ? (
            <Text style={styles.emptyText}>No step history available yet.</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
