import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/Colors";

export type CalendarMark = {
  /** Cor do ponto/fundo que indica um jogo nesse dia. */
  color: string;
};

type Props = {
  /** Data selecionada no formato AAAA-MM-DD. */
  selectedDate: string;
  onSelectDate: (date: string) => void;
  /** Dias com jogo, chave AAAA-MM-DD (data local). */
  marks: Record<string, CalendarMark>;
  /** Dia da semana do horario fixo da conta (0 = domingo), destacado de leve. */
  highlightWeekday?: number;
};

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function toDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function EventCalendar({ selectedDate, onSelectDate, marks, highlightWeekday }: Props) {
  const initial = parseKey(selectedDate) ?? new Date();
  const [month, setMonth] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  // Ao trocar a data por fora (ex.: abrir o modal de novo), mostra o mes dela.
  useEffect(() => {
    const d = parseKey(selectedDate);
    if (d) setMonth({ year: d.getFullYear(), month: d.getMonth() });
  }, [selectedDate]);

  const todayKey = toDateKey(new Date());

  const weeks = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
    const cells: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(month.year, month.month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  const gamesThisMonth = Object.keys(marks).filter((key) => {
    const d = parseKey(key);
    return d && d.getFullYear() === month.year && d.getMonth() === month.month;
  }).length;

  function shiftMonth(delta: number) {
    setMonth((current) => {
      const d = new Date(current.year, current.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => shiftMonth(-1)} style={styles.navBtn} accessibilityLabel="Mes anterior">
          <Text style={styles.navBtnText}>‹</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.monthTitle}>
            {MONTHS[month.month]} {month.year}
          </Text>
          <Text style={styles.monthMeta}>
            {gamesThisMonth === 0 ? "nenhum jogo" : gamesThisMonth === 1 ? "1 jogo" : `${gamesThisMonth} jogos`}
          </Text>
        </View>
        <Pressable onPress={() => shiftMonth(1)} style={styles.navBtn} accessibilityLabel="Proximo mes">
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((label, index) => (
          <Text
            key={index}
            style={[styles.weekday, index === highlightWeekday && styles.weekdayHighlight]}>
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {week.map((date, colIndex) => {
            if (!date) return <View key={colIndex} style={styles.cell} />;
            const key = toDateKey(date);
            const mark = marks[key];
            const isSelected = key === selectedDate;
            const isToday = key === todayKey;
            return (
              <Pressable
                key={colIndex}
                onPress={() => onSelectDate(key)}
                style={styles.cell}
                accessibilityLabel={`${date.getDate()} de ${MONTHS[date.getMonth()]}${mark ? ", tem jogo" : ""}`}>
                <View
                  style={[
                    styles.day,
                    colIndex === highlightWeekday && styles.dayScheduled,
                    mark && { backgroundColor: mark.color + "26", borderColor: mark.color },
                    isToday && styles.dayToday,
                    isSelected && styles.daySelected,
                  ]}>
                  <Text
                    style={[
                      styles.dayText,
                      mark && styles.dayTextMarked,
                      isSelected && styles.dayTextSelected,
                    ]}>
                    {date.getDate()}
                  </Text>
                  {mark ? <View style={[styles.dot, { backgroundColor: isSelected ? "#ffffff" : mark.color }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: Colors.tint }]} />
          <Text style={styles.legendText}>dia com jogo (toque para ver)</Text>
        </View>
        {highlightWeekday !== undefined ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, styles.dayScheduled]} />
            <Text style={styles.legendText}>dia do horario fixo</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  headerCenter: { flex: 1, alignItems: "center" },
  monthTitle: { color: Colors.text, fontSize: 17, fontWeight: "800" },
  monthMeta: { color: Colors.textMuted, fontSize: 12 },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf4e7",
  },
  navBtnText: { color: Colors.text, fontSize: 22, fontWeight: "700", marginTop: -2 },
  row: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    paddingVertical: 4,
  },
  weekdayHighlight: { color: Colors.tint },
  cell: { flex: 1, aspectRatio: 1, padding: 2, maxHeight: 48 },
  day: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayScheduled: { backgroundColor: "#f3f8ee" },
  dayToday: { borderColor: Colors.textMuted, borderStyle: "dashed" },
  daySelected: { backgroundColor: Colors.surfaceStrong, borderColor: Colors.surfaceStrong, borderStyle: "solid" },
  dayText: { color: Colors.text, fontSize: 15, fontWeight: "600" },
  dayTextMarked: { fontWeight: "800" },
  dayTextSelected: { color: "#ffffff" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1, borderColor: "#d5dfd1" },
  legendText: { color: Colors.textMuted, fontSize: 12 },
});
