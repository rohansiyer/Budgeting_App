import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Circle, Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { CategorySpending } from '../types';

interface DualLayerPieChartProps {
  data: CategorySpending[];
  categories: Array<{ id: string; name: string; color: string }>;
  size?: number;
}

export const DualLayerPieChart: React.FC<DualLayerPieChartProps> = ({
  data,
  categories,
  size = 300,
}) => {
  const centerX = size / 2;
  const centerY = size / 2;
  const outerRadius = size * 0.4;
  const innerRadius = size * 0.25;

  // Calculate total planned and actual
  const totalPlanned = data.reduce((sum, item) => sum + item.planned, 0);
  const totalActual = data.reduce((sum, item) => sum + item.actual, 0);

  if (totalPlanned === 0 && totalActual === 0) {
    return (
      <View style={[styles.container, { height: size }]}>
        <Text style={styles.emptyText}>No spending data available</Text>
      </View>
    );
  }

  const createArcPath = (
    startAngle: number,
    endAngle: number,
    radius: number
  ): string => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M',
      start.x,
      start.y,
      'A',
      radius,
      radius,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
    ].join(' ');
  };

  const createDonutPath = (
    startAngle: number,
    endAngle: number,
    outerR: number,
    innerR: number
  ): string => {
    const outerStart = polarToCartesian(centerX, centerY, outerR, endAngle);
    const outerEnd = polarToCartesian(centerX, centerY, outerR, startAngle);
    const innerStart = polarToCartesian(centerX, centerY, innerR, endAngle);
    const innerEnd = polarToCartesian(centerX, centerY, innerR, startAngle);

    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M',
      outerStart.x,
      outerStart.y,
      'A',
      outerR,
      outerR,
      0,
      largeArcFlag,
      0,
      outerEnd.x,
      outerEnd.y,
      'L',
      innerEnd.x,
      innerEnd.y,
      'A',
      innerR,
      innerR,
      0,
      largeArcFlag,
      1,
      innerStart.x,
      innerStart.y,
      'Z',
    ].join(' ');
  };

  const polarToCartesian = (
    centerX: number,
    centerY: number,
    radius: number,
    angleInDegrees: number
  ) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  // Render outer ring (planned budget)
  const renderOuterRing = () => {
    let currentAngle = 0;
    return data.map((item, index) => {
      const category = categories.find((c) => c.id === item.categoryId);
      if (!category || item.planned === 0) return null;

      const percentage = (item.planned / totalPlanned) * 100;
      const angle = (percentage / 100) * 360;
      const path = createDonutPath(
        currentAngle,
        currentAngle + angle,
        outerRadius,
        innerRadius + 20
      );
      currentAngle += angle;

      return (
        <Path
          key={`outer-${item.categoryId}`}
          d={path}
          fill={category.color}
          fillOpacity={0.4}
        />
      );
    });
  };

  // Render inner ring (actual spending)
  const renderInnerRing = () => {
    let currentAngle = 0;
    return data.map((item, index) => {
      const category = categories.find((c) => c.id === item.categoryId);
      if (!category || item.actual === 0) return null;

      const percentage = (item.actual / totalActual) * 100;
      const angle = (percentage / 100) * 360;
      const path = createDonutPath(
        currentAngle,
        currentAngle + angle,
        innerRadius + 15,
        innerRadius
      );
      currentAngle += angle;

      return (
        <Path
          key={`inner-${item.categoryId}`}
          d={path}
          fill={category.color}
          fillOpacity={1}
        />
      );
    });
  };

  return (
    <View style={[styles.container, { height: size }]}>
      <Svg width={size} height={size}>
        <G>
          {/* Outer ring (planned) */}
          {renderOuterRing()}
          {/* Inner ring (actual) */}
          {renderInnerRing()}
        </G>
      </Svg>

      {/* Center text */}
      <View style={styles.centerText}>
        <Text style={styles.centerLabel}>Total Spent</Text>
        <Text style={styles.centerAmount}>
          ${totalActual.toFixed(0)}
        </Text>
        <Text style={styles.centerSubtext}>
          of ${totalPlanned.toFixed(0)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  centerAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
  centerSubtext: {
    fontSize: 14,
    color: colors.text.disabled,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.disabled,
    textAlign: 'center',
  },
});
