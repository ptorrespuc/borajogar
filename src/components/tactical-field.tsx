/**
 * TacticalField
 *
 * Campo de futebol vertical com slots de posição.
 * Coordenadas do banco: x/y em 0–100 (% da área de jogo).
 *   y=0 → linha do goleiro  |  y=100 → ataque
 *
 * Modos:
 *  - view: só visualização (nome do jogador ou label da posição)
 *  - assign: clique em slot para selecioná-lo, depois clique no jogador para atribuí-lo
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TacticalFormation, TacticalFormationSlot } from "@/src/types/domain";

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type SlotAssignment = {
  slotId: string;
  playerId: string;
  playerName: string;
};

type Props = {
  formation: TacticalFormation;
  assignments?: SlotAssignment[]; // jogadores já atribuídos
  selectedSlotId?: string | null; // slot aguardando um jogador (modo assign)
  onSlotPress?: (slot: TacticalFormationSlot) => void;
  disabled?: boolean;
};

// ─── Paleta ───────────────────────────────────────────────────────────────────

const FIELD_GREEN = "#3a8c3f";
const FIELD_GREEN_DARK = "#2e7233";
const LINE_COLOR = "rgba(255,255,255,0.65)";
const SLOT_EMPTY = "rgba(255,255,255,0.18)";
const SLOT_EMPTY_BORDER = "rgba(255,255,255,0.5)";
const SLOT_FILLED = "#1d7f46";
const SLOT_FILLED_BORDER = "#a8e6b8";
const SLOT_PENDING = "#f5a623";
const SLOT_PENDING_BORDER = "#ffe0a0";
const TEXT_WHITE = "#ffffff";
const TEXT_DIM = "rgba(255,255,255,0.65)";

// ─── Componente ───────────────────────────────────────────────────────────────

export default function TacticalField({
  formation,
  assignments = [],
  selectedSlotId,
  onSlotPress,
  disabled = false,
}: Props) {
  const assignmentBySlot = new Map(assignments.map((a) => [a.slotId, a]));

  return (
    <View style={styles.wrapper}>
      {/* ── Campo ──────────────────────────────────────────────────────────── */}
      <View style={styles.field}>
        {/* Faixas horizontais alternadas */}
        {[...Array(7)].map((_, i) => (
          <View
            key={i}
            style={[
              styles.stripe,
              { top: `${(i / 7) * 100}%`, height: `${100 / 7}%` },
              i % 2 === 0 ? styles.stripeLight : styles.stripeDark,
            ]}
          />
        ))}

        {/* Linhas do campo */}
        <FieldLines />

        {/* ── Slots de posição ─────────────────────────────────────────────── */}
        {formation.slots.map((slot) => {
          const assignment = assignmentBySlot.get(slot.id);
          const isFilled = !!assignment;
          const isSelected = slot.id === selectedSlotId;

          return (
            <Pressable
              key={slot.id}
              onPress={() => !disabled && onSlotPress?.(slot)}
              style={[
                styles.slot,
                {
                  left: `${slot.position_x}%`,
                  top: `${slot.position_y}%`,
                },
                isFilled ? styles.slotFilled : styles.slotEmpty,
                isSelected && styles.slotPending,
              ]}
            >
              {isFilled ? (
                <Text style={styles.slotPlayerName} numberOfLines={1}>
                  {assignment!.playerName.split(" ")[0]}
                </Text>
              ) : (
                <Text style={[styles.slotLabel, isSelected && styles.slotLabelSelected]}>{slot.slot_label}</Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── Banner de posição selecionada ─────────────────────────────────── */}
      {selectedSlotId && (
        <View style={styles.pendingBanner}>
          <Text style={styles.pendingText}>
            👆 Toque em um jogador para posicioná-lo
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Linhas do campo (SVG via View) ──────────────────────────────────────────

function FieldLines() {
  return (
    <>
      {/* Linha do meio */}
      <View style={[styles.line, styles.lineHorizontal, { top: "50%" }]} />
      {/* Círculo central */}
      <View style={styles.centerCircle} />
      <View style={styles.centerDot} />
      {/* Área do goleiro (defesa — topo) */}
      <View style={styles.goalAreaTop} />
      <View style={styles.goalBoxTop} />
      {/* Área do ataque (baixo) */}
      <View style={styles.goalAreaBottom} />
      <View style={styles.goalBoxBottom} />
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const SLOT_SIZE = 48;
const SLOT_HALF = SLOT_SIZE / 2;

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    gap: 8,
  },

  // Campo
  field: {
    width: "100%",
    aspectRatio: 0.62, // ~proporção de campo society (retrato)
    backgroundColor: FIELD_GREEN,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    borderWidth: 2,
    borderColor: LINE_COLOR,
  },

  // Faixas decorativas
  stripe: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  stripeLight: { backgroundColor: FIELD_GREEN },
  stripeDark: { backgroundColor: FIELD_GREEN_DARK },

  // Linhas do campo
  line: {
    position: "absolute",
    backgroundColor: LINE_COLOR,
  },
  lineHorizontal: {
    left: 0,
    right: 0,
    height: 1.5,
  },

  centerCircle: {
    position: "absolute",
    width: "34%",
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: LINE_COLOR,
    top: "50%",
    left: "50%",
    transform: [{ translateX: "-50%" }, { translateY: "-50%" }],
    backgroundColor: "transparent",
  },
  centerDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LINE_COLOR,
    top: "50%",
    left: "50%",
    transform: [{ translateX: -3 }, { translateY: -3 }],
  },

  // Áreas do campo
  goalAreaTop: {
    position: "absolute",
    top: "2%",
    left: "20%",
    right: "20%",
    height: "16%",
    borderWidth: 1.5,
    borderColor: LINE_COLOR,
    borderTopWidth: 0,
    backgroundColor: "transparent",
  },
  goalBoxTop: {
    position: "absolute",
    top: "2%",
    left: "35%",
    right: "35%",
    height: "7%",
    borderWidth: 1.5,
    borderColor: LINE_COLOR,
    borderTopWidth: 0,
    backgroundColor: "transparent",
  },
  goalAreaBottom: {
    position: "absolute",
    bottom: "2%",
    left: "20%",
    right: "20%",
    height: "16%",
    borderWidth: 1.5,
    borderColor: LINE_COLOR,
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  goalBoxBottom: {
    position: "absolute",
    bottom: "2%",
    left: "35%",
    right: "35%",
    height: "7%",
    borderWidth: 1.5,
    borderColor: LINE_COLOR,
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },

  // Slots de posição
  slot: {
    position: "absolute",
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: SLOT_HALF,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -SLOT_HALF,
    marginTop: -SLOT_HALF,
    borderWidth: 2,
    paddingHorizontal: 2,
  },
  slotEmpty: {
    backgroundColor: SLOT_EMPTY,
    borderColor: SLOT_EMPTY_BORDER,
  },
  slotFilled: {
    backgroundColor: SLOT_FILLED,
    borderColor: SLOT_FILLED_BORDER,
  },
  slotPending: {
    backgroundColor: SLOT_PENDING,
    borderColor: SLOT_PENDING_BORDER,
  },
  slotLabel: {
    color: TEXT_DIM,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  slotLabelSelected: {
    color: TEXT_WHITE,
    fontWeight: "900",
  },
  slotPlayerName: {
    color: TEXT_WHITE,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },

  // Banner do jogador pendente
  pendingBanner: {
    backgroundColor: "#fff8e6",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: SLOT_PENDING_BORDER,
  },
  pendingText: {
    color: "#7a5200",
    fontSize: 13,
    textAlign: "center",
  },
  pendingName: {
    fontWeight: "800",
  },
});
