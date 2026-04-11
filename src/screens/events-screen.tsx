import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/Colors";
import {
  addPlayerToWeeklyEvent,
  closeWeeklyEventList,
  completeEventMatch,
  completeWeeklyEvent,
  createEventMatch,
  createEventPoll,
  createWeeklyEventCall,
  getAccountOverview,
  listAccountEventTimeline,
  listAccountPlayers,
  listAccountPollTemplates,
  listAllSportsAccounts,
  listEventPollBallots,
  listModalityPositions,
  listTacticalFormations,
  removePlayerFromWeeklyEvent,
  updateEventMatch,
  upsertEventPollVote,
  type AccountOverview,
  type AccountPlayerAdminItem,
  type EventMatchItem,
  type EventPollBallot,
  type EventPollOptionInput,
  type EventTimelineItem,
  type WeeklyEventParticipantItem,
} from "@/src/lib/accounts";
import { useAuth } from "@/src/providers/auth-provider";
import type {
  AccountRole,
  Event,
  ModalityPosition,
  PollSelectionMode,
  PollTemplate,
  SportsAccount,
  EventPollVote,
  TacticalFormation,
  TacticalFormationSlot,
} from "@/src/types/domain";
import TacticalField, { type SlotAssignment } from "@/src/components/tactical-field";

const roleLabels: Record<AccountRole, string> = {
  group_admin: "Admin do grupo",
  group_moderator: "Moderador do grupo",
  player: "Jogador",
};

type AccountAccessItem = {
  account: SportsAccount;
  roleLabel: string;
  membershipRole: AccountRole | null;
  priorityGroupName: string | null;
};

type EventPollSourceChoice =
  | {
      kind: "template";
      templateId: string;
    }
  | {
      kind: "custom";
    };

type EventPollOptionDraft = {
  id: string;
  label: string;
  description: string;
  targetParticipantId: string | null;
};

type MatchModalState =
  | null
  | {
      mode: "create" | "edit";
      targetId?: string;
    };

type EventSectionKey = "roster" | "polls" | "matches";

type MatchAutoBalanceResult = {
  homePlayerIds: string[];
  awayPlayerIds: string[];
  assignedPositionIds: Record<string, string | null>;
  homeRating: number;
  awayRating: number;
};

let eventPollOptionDraftCounter = 0;

function createEventPollOptionDraft(
  initial?: Partial<Pick<EventPollOptionDraft, "label" | "description" | "targetParticipantId">>,
): EventPollOptionDraft {
  eventPollOptionDraftCounter += 1;

  return {
    id: `event-poll-option-${eventPollOptionDraftCounter}`,
    label: initial?.label ?? "",
    description: initial?.description ?? "",
    targetParticipantId: initial?.targetParticipantId ?? null,
  };
}

function getReadableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar os eventos.";
}

function formatEventState(status: Event["status"]) {
  if (status === "draft") {
    return "Evento criado";
  }

  if (status === "published") {
    return "Evento fechado";
  }

  if (status === "completed") {
    return "Evento encerrado";
  }

  return "Cancelado";
}

function getEventStateIndex(status: Event["status"] | null) {
  if (!status) {
    return 0;
  }

  if (status === "draft") {
    return 1;
  }

  if (status === "published") {
    return 2;
  }

  return 3;
}

function formatEventDate(isoValue: string) {
  return new Date(isoValue).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventWeekday(isoValue: string) {
  return new Date(isoValue).toLocaleDateString("pt-BR", { weekday: "long" });
}

function formatEventDay(isoValue: string) {
  return new Date(isoValue).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatEventTime(isoValue: string) {
  return new Date(isoValue).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEventStatusStyle(status: Event["status"]) {
  switch (status) {
    case "draft":
      return { label: "Em montagem", bg: "#e8f3e8", text: "#2e6b2e", dot: "#4caf50" };
    case "published":
      return { label: "Lista fechada", bg: "#fff3e0", text: "#c45000", dot: "#ff9800" };
    case "completed":
      return { label: "Encerrado", bg: "#f3f4f6", text: "#4b5563", dot: "#9ca3af" };
    case "cancelled":
      return { label: "Cancelado", bg: "#fee2e2", text: "#b91c1c", dot: "#ef4444" };
  }
}

function formatPollStatus(status: EventPollBallot["poll"]["status"]) {
  if (status === "open") {
    return "Aberta para votos";
  }

  if (status === "closed") {
    return "Fechada";
  }

  if (status === "archived") {
    return "Arquivada";
  }

  return "Rascunho";
}

function PlayerAvatar({
  name,
  photoUrl,
  size = 42,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarFallbackText}>{initials}</Text>
    </View>
  );
}

function getBalanceRating(value: number | null) {
  return typeof value === "number" ? value : 5;
}

function formatPlayerRating(value: number | null) {
  return value === null ? "Sem nota" : value.toFixed(2);
}

function calculateTeamRating(
  playerIds: string[],
  participants: WeeklyEventParticipantItem[],
) {
  const participantMap = new Map(participants.map((item) => [item.player.id, item]));

  return Number(
    playerIds
      .reduce((total, playerId) => total + getBalanceRating(participantMap.get(playerId)?.player.rating ?? null), 0)
      .toFixed(2),
  );
}

/**
 * Após o balanceamento por nota e a atribuição de posições dentro de cada time,
 * tenta melhorar o encaixe posicional trocando um jogador entre times.
 *
 * Uma troca (homePlayer ↔ awayPlayer) é aceita se:
 *  1. Reduz o total de penalidade de classificação (improviso=2, secondary=1, principal=0)
 *  2. Não aumenta a diferença de rating bruto entre os times além da tolerância
 *
 * Itera até não haver mais trocas que melhorem o encaixe (pode convergir em 1 passada).
 */
function buildDefaultMatchFormationCounts(
  positions: ModalityPosition[],
  playersPerTeam: number,
): Record<string, string> {
  const counts = Object.fromEntries(positions.map((position) => [position.id, "0"])) as Record<string, string>;

  if (positions.length === 0 || playersPerTeam <= 0) {
    return counts;
  }

  let remaining = playersPerTeam;
  let index = 0;

  while (remaining > 0) {
    const position = positions[index % positions.length];
    const currentValue = Number(counts[position.id] ?? "0");
    counts[position.id] = String(currentValue + 1);
    remaining -= 1;
    index += 1;
  }

  return counts;
}

function buildMatchFormationCountsFromLineup(
  positions: ModalityPosition[],
  homePlayerIds: string[],
  awayPlayerIds: string[],
  assignedPositionIds: Record<string, string | null>,
) {
  const counts = Object.fromEntries(positions.map((position) => [position.id, "0"])) as Record<string, string>;

  for (const position of positions) {
    const homeCount = homePlayerIds.filter((playerId) => assignedPositionIds[playerId] === position.id).length;
    const awayCount = awayPlayerIds.filter((playerId) => assignedPositionIds[playerId] === position.id).length;
    const nextCount = Math.max(homeCount, awayCount);
    counts[position.id] = String(nextCount);
  }

  return counts;
}

function parseMatchFormationCount(value: string | undefined) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function getSelectedFormationPositions(
  positions: ModalityPosition[],
  formationCounts: Record<string, string>,
) {
  return positions
    .map((position) => ({
      position,
      countPerTeam: parseMatchFormationCount(formationCounts[position.id]),
    }))
    .filter((item) => item.countPerTeam > 0);
}

function buildLineupInput(
  playerIds: string[],
  assignedPositionIds: Record<string, string | null>,
) {
  return playerIds.map((playerId) => ({
    playerId,
    modalityPositionId: assignedPositionIds[playerId] ?? null,
  }));
}

/**
 * Remapeia SlotAssignments de uma formação antiga para uma nova,
 * mantendo a ordem posicional dos jogadores (slot sort_order).
 * Jogador na posição ordinal N do esquema antigo vai para o slot N do novo.
 */
function remapSlotAssignments(
  currentAssignments: SlotAssignment[],
  oldFormation: TacticalFormation | null,
  newFormation: TacticalFormation | null,
): SlotAssignment[] {
  if (!oldFormation || !newFormation || currentAssignments.length === 0) return [];

  // Slots do esquema antigo ordenados por sort_order
  const oldSlotsSorted = [...oldFormation.slots].sort((a, b) => a.sort_order - b.sort_order);

  // Jogadores na ordem dos slots antigos (apenas os que estão atribuídos)
  const orderedPlayers: { playerId: string; playerName: string; classification?: SlotAssignment["classification"] }[] = [];
  for (const slot of oldSlotsSorted) {
    const assignment = currentAssignments.find((a) => a.slotId === slot.id);
    if (assignment) {
      orderedPlayers.push({
        playerId: assignment.playerId,
        playerName: assignment.playerName,
        classification: assignment.classification,
      });
    }
  }

  // Slots do novo esquema ordenados por sort_order
  const newSlotsSorted = [...newFormation.slots].sort((a, b) => a.sort_order - b.sort_order);

  // Mapeamento 1:1 por ordem posicional
  const result: SlotAssignment[] = [];
  for (let i = 0; i < Math.min(orderedPlayers.length, newSlotsSorted.length); i++) {
    result.push({
      slotId: newSlotsSorted[i].id,
      playerId: orderedPlayers[i].playerId,
      playerName: orderedPlayers[i].playerName,
      classification: orderedPlayers[i].classification,
    });
  }
  return result;
}

/**
 * Converte assignedPositionIds (playerId → modalityPositionId) em SlotAssignment[]
 * (slotId → playerId, playerName) que o TacticalField consome.
 *
 * Cada slot da formação é usado no máximo uma vez; jogadores sem posição atribuída
 * ou sem slot disponível são ignorados silenciosamente.
 */
function buildSlotAssignmentsFromPositions(
  playerIds: string[],
  assignedPositionIds: Record<string, string | null>,
  formation: TacticalFormation | null,
  participants: WeeklyEventParticipantItem[],
): SlotAssignment[] {
  if (!formation) return [];

  const participantMap = new Map(participants.map((p) => [p.player.id, p]));
  const usedSlotIds = new Set<string>();
  const result: SlotAssignment[] = [];

  for (const playerId of playerIds) {
    const positionId = assignedPositionIds[playerId];
    if (!positionId) continue;

    const slot = formation.slots.find(
      (s) => s.modality_position_id === positionId && !usedSlotIds.has(s.id),
    );
    if (!slot) continue;

    const participant = participantMap.get(playerId);
    if (!participant) continue;

    const assignedPos = participant.preferredPositions.find(
      (p) => p.id === slot.modality_position_id,
    );
    usedSlotIds.add(slot.id);
    result.push({
      slotId: slot.id,
      playerId,
      playerName: participant.player.full_name,
      classification: assignedPos?.classification ?? null,
    });
  }

  return result;
}

/**
 * Atribui jogadores a slots do campo usando as notas por posição.
 * Prioriza a posição em que cada jogador tem maior nota; jogadores sem
 * nota por posição preenchem os slots restantes.
 * Não altera a composição dos times — apenas posiciona no campo.
 */
/**
 * Monta dois times equilibrados seguindo a especificação de heurística em 7 passos:
 *
 * 1. Calcular escassez por posição (oferta - demanda) e ordenar vagas da mais crítica para menos crítica.
 * 2. Gerar lista de vagas na ordem de escassez.
 * 3. Alocação estrutural: para cada vaga, escolher o melhor candidato disponível por prioridade:
 *    aptidão → flexibilidade → impacto estrutural → nota na posição → id.
 * 4. Distribuição entre times por posição: ordenar por nota desc e alternar para minimizar diferença.
 * 5. Refinamento: trocas entre times enquanto reduzir diferença sem aumentar improvisos.
 */
function autoGenerateMatchTeamsByPositions(input: {
  selectedPlayerIds: string[];
  participants: WeeklyEventParticipantItem[];
  positions: ModalityPosition[];
  formationCounts: Record<string, string>;
}): MatchAutoBalanceResult {
  const selectedFormation = getSelectedFormationPositions(input.positions, input.formationCounts);
  const playersPerTeam = selectedFormation.reduce((total, item) => total + item.countPerTeam, 0);

  if (playersPerTeam === 0) {
    throw new Error("Defina pelo menos uma posicao na formacao antes de gerar os times.");
  }

  const requiredPlayerCount = playersPerTeam * 2;
  const uniqueSelectedPlayerIds = [...new Set(input.selectedPlayerIds)];

  if (uniqueSelectedPlayerIds.length !== requiredPlayerCount) {
    throw new Error(
      `Selecione exatamente ${requiredPlayerCount} jogadores para preencher a formacao de ${playersPerTeam} por time.`,
    );
  }

  const participantMap = new Map(
    input.participants.map((participant, index) => [participant.player.id, { participant, order: index }]),
  );

  // aptidão numérica: 0 = Principal, 1 = Secundária, 2 = Improviso
  const aptidaoOrder = { principal: 0 as const, secondary: 1 as const, improviso: 2 as const };

  type PosEntry = {
    positionId: string;
    positionRating: number;
    aptidao: 0 | 1 | 2;
  };
  type PlayerData = {
    id: string;
    order: number;
    generalRating: number;
    // apenas posições que existem na formação escolhida
    formationPositions: PosEntry[];
  };

  const formationPositionIdSet = new Set(selectedFormation.map((item) => item.position.id));

  const players: PlayerData[] = uniqueSelectedPlayerIds
    .map((playerId) => {
      const entry = participantMap.get(playerId);
      if (!entry) return null;

      const formationPositions: PosEntry[] = entry.participant.preferredPositions
        .filter((pos) => formationPositionIdSet.has(pos.id))
        .map((pos) => ({
          positionId: pos.id,
          positionRating: pos.positionRating ?? getBalanceRating(entry.participant.player.rating),
          aptidao: pos.classification != null ? aptidaoOrder[pos.classification] : 2,
        }));

      return {
        id: playerId,
        order: entry.order,
        generalRating: getBalanceRating(entry.participant.player.rating),
        formationPositions,
      };
    })
    .filter((p): p is PlayerData => p !== null);

  // ── PASSO 1: Calcular escassez ────────────────────────────────────────────
  // Para cada posição: oferta = jogadores aptos, demanda = vagas totais (formação × 2 times)
  const formationWithScarcity = selectedFormation
    .map(({ position, countPerTeam }) => {
      const demand = countPerTeam * 2;
      const supply = players.filter((p) =>
        p.formationPositions.some((pos) => pos.positionId === position.id),
      ).length;
      return { position, countPerTeam, demand, supply, slack: supply - demand };
    })
    .sort((a, b) => {
      // menor folga → mais crítica; empate: menor oferta; empate: maior demanda
      if (a.slack !== b.slack) return a.slack - b.slack;
      if (a.supply !== b.supply) return a.supply - b.supply;
      return b.demand - a.demand;
    });

  // Posições críticas: folga ≤ 1 (usadas no critério de impacto estrutural)
  const criticalPositionIds = new Set(
    formationWithScarcity.filter((p) => p.slack <= 1).map((p) => p.position.id),
  );

  // ── PASSO 2: Gerar lista de vagas ordenada por escassez ──────────────────
  // Intercala uma vaga por posição em cada rodada para evitar que posições com
  // os mesmos candidatos esgotem o pool antes das outras posições igualmente críticas.
  // Ex: [PE, PD, CA, PE, PD, CA] em vez de [PE, PE, PD, PD, CA, CA]
  const slotQueue: { positionId: string }[] = [];
  const maxTotalSlots = Math.max(...formationWithScarcity.map((f) => f.countPerTeam * 2));
  for (let round = 0; round < maxTotalSlots; round++) {
    for (const { position, countPerTeam } of formationWithScarcity) {
      if (round < countPerTeam * 2) {
        slotQueue.push({ positionId: position.id });
      }
    }
  }

  // ── PASSO 3: Alocação estrutural (greedy) ────────────────────────────────
  const assignedPositionMap = new Map<string, string>(); // playerId → positionId
  const assignedPlayerSet = new Set<string>();
  const remainingSlotCount = new Map<string, number>(
    formationWithScarcity.map(({ position, countPerTeam }) => [position.id, countPerTeam * 2]),
  );

  for (const { positionId } of slotQueue) {
    // Candidatos: não atribuídos e que têm esta posição na formação
    let candidates = players.filter(
      (p) =>
        !assignedPlayerSet.has(p.id) &&
        p.formationPositions.some((pos) => pos.positionId === positionId),
    );

    // Regra fundamental: só usa aptidão 2 (improviso) se não houver 0 ou 1 disponível
    const hasPrincipalOrSecondary = candidates.some((p) =>
      p.formationPositions.find((pos) => pos.positionId === positionId && pos.aptidao < 2),
    );
    if (hasPrincipalOrSecondary) {
      candidates = candidates.filter((p) =>
        p.formationPositions.find((pos) => pos.positionId === positionId && pos.aptidao < 2),
      );
    }

    if (candidates.length === 0) {
      // Sem candidatos: usa qualquer jogador não atribuído (improviso total)
      candidates = players.filter((p) => !assignedPlayerSet.has(p.id));
    }

    candidates.sort((a, b) => {
      const aPosData = a.formationPositions.find((pos) => pos.positionId === positionId);
      const bPosData = b.formationPositions.find((pos) => pos.positionId === positionId);

      // 1. Aptidão (menor = melhor)
      const aApt = aPosData?.aptidao ?? 2;
      const bApt = bPosData?.aptidao ?? 2;
      if (aApt !== bApt) return aApt - bApt;

      // 2. Flexibilidade: menos posições na formação = prioridade (preserva versáteis)
      if (a.formationPositions.length !== b.formationPositions.length)
        return a.formationPositions.length - b.formationPositions.length;

      // 3. Impacto estrutural: menos posições críticas cobertas = menor impacto = prioridade
      const aImpact = a.formationPositions.filter((pos) => criticalPositionIds.has(pos.positionId)).length;
      const bImpact = b.formationPositions.filter((pos) => criticalPositionIds.has(pos.positionId)).length;
      if (aImpact !== bImpact) return aImpact - bImpact;

      // 4. Nota na posição (maior = melhor)
      const aRating = aPosData?.positionRating ?? a.generalRating;
      const bRating = bPosData?.positionRating ?? b.generalRating;
      if (bRating !== aRating) return bRating - aRating;

      // 5. ID (desempate determinístico)
      return a.id.localeCompare(b.id);
    });

    const selected = candidates[0];
    if (!selected) continue;

    assignedPositionMap.set(selected.id, positionId);
    assignedPlayerSet.add(selected.id);
    remainingSlotCount.set(positionId, (remainingSlotCount.get(positionId) ?? 0) - 1);
  }

  // Jogadores que não foram atribuídos (edge case): encher slots restantes
  for (const player of players) {
    if (assignedPlayerSet.has(player.id)) continue;
    for (const [positionId, count] of remainingSlotCount.entries()) {
      if (count > 0) {
        assignedPositionMap.set(player.id, positionId);
        assignedPlayerSet.add(player.id);
        remainingSlotCount.set(positionId, count - 1);
        break;
      }
    }
  }

  // ── PASSO 4: Distribuição entre times por posição ────────────────────────
  // Para cada posição: ordenar jogadores por nota desc e alternar home/away
  const playersByPosition = new Map<string, PlayerData[]>();
  for (const player of players) {
    const positionId = assignedPositionMap.get(player.id);
    if (!positionId) continue;
    const list = playersByPosition.get(positionId) ?? [];
    list.push(player);
    playersByPosition.set(positionId, list);
  }

  const homePlayerIds: string[] = [];
  const awayPlayerIds: string[] = [];
  let homeRating = 0;
  let awayRating = 0;

  // Função auxiliar: nota efetiva do jogador na posição atribuída
  function effectiveRating(player: PlayerData, positionId: string): number {
    return player.formationPositions.find((pos) => pos.positionId === positionId)?.positionRating ?? player.generalRating;
  }

  for (const { position, countPerTeam } of formationWithScarcity) {
    const candidates = [...(playersByPosition.get(position.id) ?? [])].sort((a, b) => {
      const aR = effectiveRating(a, position.id);
      const bR = effectiveRating(b, position.id);
      if (bR !== aR) return bR - aR;
      return a.order - b.order;
    });

    let homeRemaining = countPerTeam;
    let awayRemaining = countPerTeam;

    for (const candidate of candidates) {
      const rating = effectiveRating(candidate, position.id);
      const shouldUseHome =
        awayRemaining === 0
          ? true
          : homeRemaining === 0
            ? false
            : homeRating < awayRating || (homeRating === awayRating && homePlayerIds.length <= awayPlayerIds.length);

      if (shouldUseHome) {
        homePlayerIds.push(candidate.id);
        homeRating += rating;
        homeRemaining -= 1;
      } else {
        awayPlayerIds.push(candidate.id);
        awayRating += rating;
        awayRemaining -= 1;
      }
    }
  }

  // ── PASSO 5: Refinamento por trocas ─────────────────────────────────────
  // Troca jogadores entre times enquanto reduzir diferença sem aumentar improvisos.
  // Uma troca é: home[i] ↔ away[j] (ambos mantêm a posição atribuída, só trocam de time).

  function playerImproviso(playerId: string): boolean {
    const posId = assignedPositionMap.get(playerId);
    const player = players.find((p) => p.id === playerId);
    if (!player || !posId) return true;
    const posData = player.formationPositions.find((pos) => pos.positionId === posId);
    return !posData || posData.aptidao === 2;
  }

  const totalImprovisos =
    homePlayerIds.filter(playerImproviso).length + awayPlayerIds.filter(playerImproviso).length;

  let improved = true;
  const MAX_ITER = 100;
  let iter = 0;

  while (improved && iter < MAX_ITER) {
    improved = false;
    iter++;

    for (let i = 0; i < homePlayerIds.length && !improved; i++) {
      for (let j = 0; j < awayPlayerIds.length && !improved; j++) {
        const hId = homePlayerIds[i];
        const aId = awayPlayerIds[j];
        const hPosId = assignedPositionMap.get(hId)!;
        const aPosId = assignedPositionMap.get(aId)!;

        const hPlayer = players.find((p) => p.id === hId);
        const aPlayer = players.find((p) => p.id === aId);
        if (!hPlayer || !aPlayer) continue;

        const hRating = effectiveRating(hPlayer, hPosId);
        const aRating = effectiveRating(aPlayer, aPosId);

        const newHomeRating = homeRating - hRating + aRating;
        const newAwayRating = awayRating - aRating + hRating;
        const newDiff = Math.abs(newHomeRating - newAwayRating);
        const currentDiff = Math.abs(homeRating - awayRating);

        if (newDiff >= currentDiff) continue;

        // Verificar improvisos após a troca (jogadores mantêm posição, só mudam de time)
        const newHomeIds = [...homePlayerIds];
        const newAwayIds = [...awayPlayerIds];
        newHomeIds[i] = aId;
        newAwayIds[j] = hId;
        const newImprovisos =
          newHomeIds.filter(playerImproviso).length + newAwayIds.filter(playerImproviso).length;

        if (newImprovisos > totalImprovisos) continue;

        homePlayerIds[i] = aId;
        awayPlayerIds[j] = hId;
        homeRating = newHomeRating;
        awayRating = newAwayRating;
        improved = true;
      }
    }
  }

  return {
    homePlayerIds,
    awayPlayerIds,
    assignedPositionIds: Object.fromEntries(assignedPositionMap.entries()),
    homeRating: Number(homeRating.toFixed(2)),
    awayRating: Number(awayRating.toFixed(2)),
  };
}

function getPreviousMatchWinner(matchItem: EventMatchItem) {
  if (!matchItem.homeTeam || !matchItem.awayTeam) {
    return null;
  }

  if (matchItem.homeTeam.team.score === matchItem.awayTeam.team.score) {
    return null;
  }

  return matchItem.homeTeam.team.score > matchItem.awayTeam.team.score
    ? matchItem.homeTeam
    : matchItem.awayTeam;
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, memberships } = useAuth();
  const isSuperAdmin = Boolean(profile?.is_super_admin);
  const [superAdminAccounts, setSuperAdminAccounts] = useState<SportsAccount[]>([]);
  const [isLoadingSuperAdminAccounts, setIsLoadingSuperAdminAccounts] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [timeline, setTimeline] = useState<EventTimelineItem[]>([]);
  const [modalityPositions, setModalityPositions] = useState<ModalityPosition[]>([]);
  const [accountPlayers, setAccountPlayers] = useState<AccountPlayerAdminItem[]>([]);
  const [accountPollTemplates, setAccountPollTemplates] = useState<PollTemplate[]>([]);
  const [eventPollBallots, setEventPollBallots] = useState<EventPollBallot[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [activeEventSections, setActiveEventSections] = useState<Record<EventSectionKey, boolean>>({
    roster: false,
    polls: true,
    matches: false,
  });
  const [activeEventSectionsContext, setActiveEventSectionsContext] = useState<string | null>(null);
  const [historySectionsByEvent, setHistorySectionsByEvent] = useState<
    Record<string, Record<EventSectionKey, boolean>>
  >({});
  const [viewedEventIndex, setViewedEventIndex] = useState(0);
  const [activeEventTab, setActiveEventTab] = useState<EventSectionKey>("roster");
  const [weeklyPriorityFilter, setWeeklyPriorityFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [createEventDateDraft, setCreateEventDateDraft] = useState("");
  const [isCreateEventModalVisible, setIsCreateEventModalVisible] = useState(false);
  const [eventActionId, setEventActionId] = useState<string | null>(null);
  const [batchSelectedPlayerIds, setBatchSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [isBatchAdding, setIsBatchAdding] = useState(false);
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isEventPollModalVisible, setIsEventPollModalVisible] = useState(false);
  const [isSubmittingEventPoll, setIsSubmittingEventPoll] = useState(false);
  const [selectedEventPollSource, setSelectedEventPollSource] = useState<EventPollSourceChoice | null>(null);
  const [eventPollTitleDraft, setEventPollTitleDraft] = useState("");
  const [eventPollDescriptionDraft, setEventPollDescriptionDraft] = useState("");
  const [eventPollSelectionModeDraft, setEventPollSelectionModeDraft] =
    useState<PollSelectionMode>("event_participant");
  const [eventPollOptionDrafts, setEventPollOptionDrafts] = useState<EventPollOptionDraft[]>([]);
  const [matchModal, setMatchModal] = useState<MatchModalState>(null);
  const [isSubmittingMatch, setIsSubmittingMatch] = useState(false);
  const [matchTitleDraft, setMatchTitleDraft] = useState("");
  const [matchHomeTeamNameDraft, setMatchHomeTeamNameDraft] = useState("Time A");
  const [matchAwayTeamNameDraft, setMatchAwayTeamNameDraft] = useState("Time B");
  const [matchHomeScoreDraft, setMatchHomeScoreDraft] = useState("0");
  const [matchAwayScoreDraft, setMatchAwayScoreDraft] = useState("0");
  const [matchSelectedPlayerIds, setMatchSelectedPlayerIds] = useState<string[]>([]);
  const [matchHomePlayerIds, setMatchHomePlayerIds] = useState<string[]>([]);
  const [matchAwayPlayerIds, setMatchAwayPlayerIds] = useState<string[]>([]);
  const [matchAssignedPositionIds, setMatchAssignedPositionIds] = useState<Record<string, string | null>>({});
  const [matchFormationCounts, setMatchFormationCounts] = useState<Record<string, string>>({});

  // ── Formações táticas ───────────────────────────────────────────────────────
  const [tacticalFormations, setTacticalFormations] = useState<TacticalFormation[]>([]);
  const [homeFormationId, setHomeFormationId] = useState<string | null>(null);
  const [awayFormationId, setAwayFormationId] = useState<string | null>(null);
  // Slot assignments: slotId → { playerId, playerName }
  const [homeSlotAssignments, setHomeSlotAssignments] = useState<SlotAssignment[]>([]);
  const [awaySlotAssignments, setAwaySlotAssignments] = useState<SlotAssignment[]>([]);
  // Slot aguardando um jogador (nova interação: clique no slot primeiro, depois no jogador)
  const [pendingSlot, setPendingSlot] = useState<{ slotId: string; team: "home" | "away" } | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSuperAdminAccounts() {
      if (!isSuperAdmin) {
        setSuperAdminAccounts([]);
        setIsLoadingSuperAdminAccounts(false);
        return;
      }

      setIsLoadingSuperAdminAccounts(true);

      try {
        const nextAccounts = await listAllSportsAccounts();

        if (isActive) {
          setSuperAdminAccounts(nextAccounts);
        }
      } catch (loadError) {
        if (isActive) {
          setMessage({ tone: "error", text: getReadableError(loadError) });
        }
      } finally {
        if (isActive) {
          setIsLoadingSuperAdminAccounts(false);
        }
      }
    }

    void loadSuperAdminAccounts();

    return () => {
      isActive = false;
    };
  }, [isSuperAdmin]);

  const availableAccounts = useMemo(() => {
    const accountMap = new Map<string, AccountAccessItem>();

    for (const membership of memberships) {
      accountMap.set(membership.account.id, {
        account: membership.account,
        roleLabel: roleLabels[membership.membership.role],
        membershipRole: membership.membership.role,
        priorityGroupName: membership.priorityGroup?.name ?? null,
      });
    }

    if (isSuperAdmin) {
      for (const account of superAdminAccounts) {
        if (!accountMap.has(account.id)) {
          accountMap.set(account.id, {
            account,
            roleLabel: "Super admin",
            membershipRole: null,
            priorityGroupName: null,
          });
        }
      }
    }

    return [...accountMap.values()].sort((first, second) =>
      first.account.name.localeCompare(second.account.name),
    );
  }, [isSuperAdmin, memberships, superAdminAccounts]);

  useEffect(() => {
    if (availableAccounts.length === 0) {
      setSelectedAccountId(null);
      return;
    }

    if (!availableAccounts.some((item) => item.account.id === selectedAccountId)) {
      setSelectedAccountId(availableAccounts[0].account.id);
    }
  }, [availableAccounts, selectedAccountId]);

  const selectedAccess =
    availableAccounts.find((item) => item.account.id === selectedAccountId) ?? null;
  const selectedMembership =
    memberships.find((item) => item.account.id === selectedAccountId) ?? null;
  const isWaitingForVisibleAccounts =
    isSuperAdmin &&
    (isLoadingSuperAdminAccounts || (superAdminAccounts.length > 0 && !selectedAccess));
  const isWaitingForSelectedAccountData =
    Boolean(selectedAccess) && !overview && (isLoading || message?.tone !== "error");
  const isSelectedAccountDataUnavailable =
    Boolean(selectedAccess) && !overview && !isLoading && message?.tone === "error";

  const canManageWeeklyList = Boolean(
    profile?.is_super_admin || selectedMembership?.membership.role === "group_admin",
  );
  const canManageWeeklyPolls = Boolean(
    profile?.is_super_admin ||
      selectedMembership?.membership.role === "group_admin" ||
      selectedMembership?.membership.role === "group_moderator",
  );

  function findViewerParticipantId(items: EventTimelineItem[]) {
    if (!profile) {
      return null;
    }

    const activeItem =
      items.find((item) => item.event.status === "draft" || item.event.status === "published") ?? null;

    if (!activeItem) {
      return null;
    }

    const currentParticipant =
      activeItem.participants.find(
        (item) =>
          item.linkedProfile?.id === profile.id || item.membership?.profile_id === profile.id,
      ) ?? null;

    return currentParticipant?.participant.id ?? null;
  }

  async function loadSelectedAccountData() {
    if (!selectedAccess) {
      setOverview(null);
      setTimeline([]);
      setModalityPositions([]);
      setAccountPlayers([]);
      setAccountPollTemplates([]);
      setEventPollBallots([]);
      setExpandedEventId(null);
      return;
    }

    setIsLoading(true);

    try {
      const nextOverview = await getAccountOverview(selectedAccess.account.id);
      const [nextTimeline, nextPlayers, nextTemplates, nextPositions, nextFormations] = await Promise.all([
        listAccountEventTimeline(selectedAccess.account.id, nextOverview.account.modality_id),
        canManageWeeklyList
          ? listAccountPlayers(selectedAccess.account.id, nextOverview.account.modality_id)
          : Promise.resolve([] as AccountPlayerAdminItem[]),
        canManageWeeklyPolls
          ? listAccountPollTemplates(selectedAccess.account.id)
          : Promise.resolve([] as PollTemplate[]),
        listModalityPositions(nextOverview.account.modality_id),
        listTacticalFormations(selectedAccess.account.id),
      ]);

      const nextViewerParticipantId = findViewerParticipantId(nextTimeline);
      const nextActiveItem =
        nextTimeline.find((item) => item.event.status === "published") ?? null;
      const nextBallots = nextActiveItem
        ? await listEventPollBallots({
            eventId: nextActiveItem.event.id,
            modalityId: nextOverview.account.modality_id,
            voterParticipantId: nextViewerParticipantId,
          })
        : [];

      setOverview(nextOverview);
      setTimeline(nextTimeline);
      setModalityPositions(nextPositions);
      setTacticalFormations(nextFormations);
      setAccountPlayers(nextPlayers);
      setAccountPollTemplates(nextTemplates);
      setEventPollBallots(nextBallots);
      setExpandedEventId((current) => {
        if (current && nextTimeline.some((item) => item.event.id === current)) {
          return current;
        }

        const nextHistoryItem =
          nextTimeline.find((item) => item.event.status === "completed") ?? nextTimeline[0] ?? null;
        return nextHistoryItem?.event.id ?? null;
      });
    } catch (loadError) {
      setOverview(null);
      setTimeline([]);
      setModalityPositions([]);
      setAccountPlayers([]);
      setAccountPollTemplates([]);
      setEventPollBallots([]);
      setExpandedEventId(null);
      setMessage({ tone: "error", text: getReadableError(loadError) });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function hydrate() {
      if (!selectedAccess) {
        setOverview(null);
        setTimeline([]);
        setModalityPositions([]);
        setAccountPlayers([]);
        setAccountPollTemplates([]);
        setEventPollBallots([]);
        setExpandedEventId(null);
        return;
      }

      try {
        await loadSelectedAccountData();
      } catch (error) {
        if (isActive) {
          setMessage({ tone: "error", text: getReadableError(error) });
        }
      }
    }

    void hydrate();

    return () => {
      isActive = false;
    };
  }, [selectedAccess?.account.id, canManageWeeklyList, canManageWeeklyPolls, profile?.id]);

  const activeEventItem =
    timeline.find((item) => item.event.status === "draft" || item.event.status === "published") ?? null;
  const historyItems = activeEventItem
    ? timeline.filter((item) => item.event.id !== activeEventItem.event.id)
    : timeline;
  const viewedEventItem = timeline[viewedEventIndex] ?? null;
  const isViewingActiveEvent = viewedEventItem?.event.id === activeEventItem?.event.id;
  const viewedRoster = (viewedEventItem?.participants ?? []).filter(
    (p) => p.participant.selection_status === "active",
  );
  const activeParticipants = (activeEventItem?.participants ?? [])
    .filter((item) => item.participant.selection_status === "active")
    .sort((first, second) => {
      if (first.participant.priority_rank_snapshot !== second.participant.priority_rank_snapshot) {
        return first.participant.priority_rank_snapshot - second.participant.priority_rank_snapshot;
      }

      if (first.participant.roster_order !== second.participant.roster_order) {
        return first.participant.roster_order - second.participant.roster_order;
      }

      return first.player.full_name.localeCompare(second.player.full_name);
    });
  const activePlayerIds = new Set(activeParticipants.map((item) => item.player.id));
  const availableWeeklyPlayers = accountPlayers
    .filter((item) => !activePlayerIds.has(item.player.id))
    .filter((item) =>
      weeklyPriorityFilter === "all" ? true : item.player.priority_group_id === weeklyPriorityFilter,
    )
    .sort((first, second) => {
      const firstRank = first.priorityGroup?.priority_rank ?? Number.MAX_SAFE_INTEGER;
      const secondRank = second.priorityGroup?.priority_rank ?? Number.MAX_SAFE_INTEGER;

      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return first.player.full_name.localeCompare(second.player.full_name);
    });
  const activeEventPollResultMap = new Map(
    (activeEventItem?.pollResults ?? []).map((summary) => [summary.poll.id, summary]),
  );
  const currentViewerParticipantId = findViewerParticipantId(timeline);
  const usedTemplateIds = new Set(
    (activeEventItem?.pollResults ?? [])
      .map((summary) => summary.poll.template_id)
      .filter((templateId): templateId is string => Boolean(templateId)),
  );
  const availableEventPollTemplates = accountPollTemplates.filter(
    (template) => !usedTemplateIds.has(template.id),
  );
  const selectedEventPollTemplate =
    selectedEventPollSource?.kind === "template"
      ? accountPollTemplates.find((template) => template.id === selectedEventPollSource.templateId) ?? null
      : null;
  const activeEventSectionsDefault =
    activeEventItem?.event.status === "draft"
      ? {
          roster: true,
          polls: true,
          matches: false,
        }
      : {
          roster: false,
          polls: true,
          matches: false,
        };
  const activeEventContextKey = activeEventItem
    ? `${activeEventItem.event.id}:${activeEventItem.event.status}`
    : "no-active-event";
  const resolvedActiveEventSections =
    activeEventSectionsContext === activeEventContextKey ? activeEventSections : activeEventSectionsDefault;

  useEffect(() => {
    if (activeEventSectionsContext === activeEventContextKey) {
      return;
    }

    setActiveEventSections(activeEventSectionsDefault);
    setActiveEventSectionsContext(activeEventContextKey);
  }, [activeEventContextKey, activeEventSectionsContext, activeEventSectionsDefault]);

  async function reloadScreenData() {
    await loadSelectedAccountData();
  }

  function toggleActiveEventSection(section: EventSectionKey) {
    setActiveEventSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function isHistorySectionExpanded(eventId: string, section: EventSectionKey) {
    return historySectionsByEvent[eventId]?.[section] ?? section === "roster";
  }

  function toggleHistorySection(eventId: string, section: EventSectionKey) {
    setHistorySectionsByEvent((current) => {
      const nextEventSections = current[eventId] ?? {
        roster: true,
        polls: false,
        matches: false,
      };

      return {
        ...current,
        [eventId]: {
          ...nextEventSections,
          [section]: !nextEventSections[section],
        },
      };
    });
  }

  function applyVoteToActiveEvent(
    ballot: EventPollBallot,
    optionId: string | null,
    targetParticipantId: string | null,
  ) {
    if (!currentViewerParticipantId || !activeEventItem) {
      return;
    }

    const previousSelectionId =
      ballot.poll.selection_mode === "predefined_options"
        ? ballot.currentVote?.option_id ?? null
        : ballot.currentVote?.target_participant_id ?? null;
    const nextSelectionId =
      ballot.poll.selection_mode === "predefined_options" ? optionId : targetParticipantId;

    const nextVote: EventPollVote = {
      id: ballot.currentVote?.id ?? `local-vote-${ballot.poll.id}-${currentViewerParticipantId}`,
      poll_id: ballot.poll.id,
      voter_participant_id: currentViewerParticipantId,
      option_id: ballot.poll.selection_mode === "predefined_options" ? optionId : null,
      target_participant_id:
        ballot.poll.selection_mode === "event_participant" ? targetParticipantId : null,
      created_at: ballot.currentVote?.created_at ?? new Date().toISOString(),
    };

    setEventPollBallots((current) =>
      current.map((item) =>
        item.poll.id === ballot.poll.id
          ? {
              ...item,
              currentVote: nextVote,
            }
          : item,
      ),
    );

    setTimeline((current) =>
      current.map((item) => {
        if (item.event.id !== activeEventItem.event.id) {
          return item;
        }

        return {
          ...item,
          pollResults: item.pollResults.map((summary) => {
            if (summary.poll.id !== ballot.poll.id) {
              return summary;
            }

            const entries = summary.entries
              .map((entry) => {
                let votes = entry.votes;

                if (
                  previousSelectionId &&
                  previousSelectionId !== nextSelectionId &&
                  entry.id === previousSelectionId
                ) {
                  votes -= 1;
                }

                if (nextSelectionId && entry.id === nextSelectionId) {
                  votes += previousSelectionId === nextSelectionId ? 0 : 1;
                }

                return {
                  ...entry,
                  votes: Math.max(votes, 0),
                };
              })
              .sort((first, second) => {
                if (second.votes !== first.votes) {
                  return second.votes - first.votes;
                }

                return first.label.localeCompare(second.label);
              });

            return {
              ...summary,
              totalVotes: previousSelectionId ? summary.totalVotes : summary.totalVotes + 1,
              entries,
            };
          }),
        };
      }),
    );
  }

  function openCreateEventModal() {
    if (!overview?.schedules[0]) {
      setMessage({ tone: "error", text: "Configure um horario semanal antes de criar a chamada." });
      return;
    }

    // Pré-calcula a data padrão (próximo dia da semana do schedule)
    const schedule = overview.schedules[0];
    const now = new Date();
    const currentWeekday = now.getDay();
    let daysUntilNext = (schedule.weekday - currentWeekday + 7) % 7;
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntilNext);

    // Se hoje é o dia e já passou o horário, pula para a próxima semana
    const [endH, endM] = schedule.ends_at.split(":").map(Number);
    const scheduleEnd = new Date(now);
    scheduleEnd.setHours(endH, endM, 0, 0);
    if (daysUntilNext === 0 && scheduleEnd <= now) {
      nextDate.setDate(nextDate.getDate() + 7);
    }

    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
    const dd = String(nextDate.getDate()).padStart(2, "0");
    setCreateEventDateDraft(`${yyyy}-${mm}-${dd}`);
    setIsCreateEventModalVisible(true);
  }

  async function handleCreateWeeklyEvent() {
    if (!selectedAccess || !overview || !profile || !canManageWeeklyList) {
      return;
    }

    const nextSchedule = overview.schedules[0];

    if (!nextSchedule) {
      setMessage({ tone: "error", text: "Configure um horario semanal antes de criar a chamada." });
      return;
    }

    // Valida formato YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(createEventDateDraft)) {
      setMessage({ tone: "error", text: "Informe a data no formato AAAA-MM-DD." });
      return;
    }

    setIsCreateEventModalVisible(false);
    setIsCreatingEvent(true);
    setMessage(null);

    try {
      await createWeeklyEventCall({
        account: overview.account,
        schedule: nextSchedule,
        priorityGroups: overview.priorityGroups,
        createdBy: profile.id,
        overrideDate: createEventDateDraft,
      });

      await reloadScreenData();
      setMessage({ tone: "success", text: "Chamada para jogo criada com sucesso." });
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setIsCreatingEvent(false);
    }
  }

  async function handleAddPlayerToWeeklyList(item: AccountPlayerAdminItem) {
    if (!activeEventItem || !profile || !canManageWeeklyList) {
      return;
    }

    setEventActionId(item.player.id);
    setMessage(null);

    try {
      await addPlayerToWeeklyEvent({
        eventId: activeEventItem.event.id,
        playerId: item.player.id,
        addedBy: profile.id,
      });
      await reloadScreenData();
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setEventActionId(null);
    }
  }

  async function handleBatchAddPlayersToWeeklyList() {
    if (!activeEventItem || !profile || !canManageWeeklyList || batchSelectedPlayerIds.size === 0) {
      return;
    }

    setIsBatchAdding(true);
    setMessage(null);

    try {
      await Promise.all(
        Array.from(batchSelectedPlayerIds).map((playerId) =>
          addPlayerToWeeklyEvent({
            eventId: activeEventItem.event.id,
            playerId,
            addedBy: profile.id,
          }),
        ),
      );
      setBatchSelectedPlayerIds(new Set());
      await reloadScreenData();
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setIsBatchAdding(false);
    }
  }

  async function handleRemovePlayerFromWeeklyList(item: WeeklyEventParticipantItem) {
    if (!canManageWeeklyList) {
      return;
    }

    setEventActionId(item.participant.id);
    setMessage(null);

    try {
      await removePlayerFromWeeklyEvent({ eventParticipantId: item.participant.id });
      await reloadScreenData();
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setEventActionId(null);
    }
  }

  function confirmCloseList(eventId: string) {
    Alert.alert(
      "Fechar lista",
      "Depois disso, ninguem mais entra no evento. A gestao segue para enquetes e partidas.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Fechar lista",
          onPress: () => {
            void handleCloseList(eventId);
          },
        },
      ],
    );
  }

  async function handleCloseList(eventId: string) {
    setEventActionId(`close-${eventId}`);
    setMessage(null);

    try {
      await closeWeeklyEventList(eventId);
      await reloadScreenData();
      setMessage({ tone: "success", text: "Lista do evento fechada." });
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setEventActionId(null);
    }
  }

  function confirmCompleteEvent(eventId: string) {
    Alert.alert(
      "Encerrar evento",
      "As enquetes abertas desse evento tambem serao encerradas.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Encerrar evento",
          style: "destructive",
          onPress: () => {
            void handleCompleteEvent(eventId);
          },
        },
      ],
    );
  }

  async function handleCompleteEvent(eventId: string) {
    setEventActionId(`complete-${eventId}`);
    setMessage(null);

    try {
      await completeWeeklyEvent(eventId);
      await reloadScreenData();
      setExpandedEventId(eventId);
      setMessage({ tone: "success", text: "Evento encerrado e movido para o historico." });
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setEventActionId(null);
    }
  }

  function resetEventPollForm() {
    setSelectedEventPollSource(null);
    setEventPollTitleDraft("");
    setEventPollDescriptionDraft("");
    setEventPollSelectionModeDraft("event_participant");
    setEventPollOptionDrafts([]);
  }

  function closeEventPollModal() {
    setIsEventPollModalVisible(false);
    setIsSubmittingEventPoll(false);
    resetEventPollForm();
  }

  function openCreateEventPollModal() {
    if (!activeEventItem || activeEventItem.event.status !== "published") {
      setMessage({ tone: "error", text: "Feche a lista antes de criar enquetes." });
      return;
    }

    resetEventPollForm();
    setIsEventPollModalVisible(true);
  }

  function selectEventPollSource(source: EventPollSourceChoice) {
    if (source.kind === "template") {
      const template = accountPollTemplates.find((item) => item.id === source.templateId);

      if (!template) {
        setMessage({ tone: "error", text: "Nao foi possivel carregar o modelo escolhido." });
        return;
      }

      setSelectedEventPollSource(source);
      setEventPollTitleDraft(template.title);
      setEventPollDescriptionDraft(template.description ?? "");
      setEventPollSelectionModeDraft(template.selection_mode);
      setEventPollOptionDrafts(
        template.selection_mode === "predefined_options"
          ? [createEventPollOptionDraft(), createEventPollOptionDraft()]
          : [],
      );
      return;
    }

    setSelectedEventPollSource(source);
    setEventPollTitleDraft("");
    setEventPollDescriptionDraft("");
    setEventPollSelectionModeDraft("event_participant");
    setEventPollOptionDrafts([]);
  }

  function addEventPollOptionDraft() {
    setEventPollOptionDrafts((current) => [...current, createEventPollOptionDraft()]);
  }

  function removeEventPollOptionDraft(optionId: string) {
    setEventPollOptionDrafts((current) => current.filter((option) => option.id !== optionId));
  }

  function updateEventPollOptionDraft(
    optionId: string,
    field: keyof EventPollOptionDraft,
    value: string | null,
  ) {
    setEventPollOptionDrafts((current) =>
      current.map((option) =>
        option.id === optionId
          ? {
              ...option,
              [field]: value,
            }
          : option,
      ),
    );
  }

  async function handleSubmitEventPoll() {
    if (!activeEventItem || !profile || !selectedEventPollSource || !canManageWeeklyPolls) {
      return;
    }

    setIsSubmittingEventPoll(true);
    setMessage(null);

    try {
      const options: EventPollOptionInput[] = eventPollOptionDrafts.map((option) => ({
        label: option.label,
        description: option.description || null,
        targetParticipantId: option.targetParticipantId,
      }));

      await createEventPoll({
        eventId: activeEventItem.event.id,
        templateId:
          selectedEventPollSource.kind === "template" ? selectedEventPollSource.templateId : null,
        title: eventPollTitleDraft,
        description: eventPollDescriptionDraft || null,
        selectionMode: eventPollSelectionModeDraft,
        createdBy: profile.id,
        options,
      });

      await reloadScreenData();
      closeEventPollModal();
      setMessage({
        tone: "success",
        text:
          selectedEventPollSource.kind === "template"
            ? "Enquete criada a partir do modelo selecionado."
            : "Enquete avulsa criada para o evento.",
      });
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setIsSubmittingEventPoll(false);
    }
  }

  function resetMatchForm() {
    setMatchTitleDraft("");
    setMatchHomeTeamNameDraft("Time A");
    setMatchAwayTeamNameDraft("Time B");
    setMatchHomeScoreDraft("0");
    setMatchAwayScoreDraft("0");
    setMatchSelectedPlayerIds([]);
    setMatchHomePlayerIds([]);
    setMatchAwayPlayerIds([]);
    setMatchAssignedPositionIds({});
    setMatchFormationCounts(buildDefaultMatchFormationCounts(modalityPositions, overview?.modality.players_per_team ?? 0));
    const defaultFormation = tacticalFormations.find((f) => f.is_default) ?? tacticalFormations[0] ?? null;
    setHomeFormationId(defaultFormation?.id ?? null);
    setAwayFormationId(defaultFormation?.id ?? null);
    setHomeSlotAssignments([]);
    setAwaySlotAssignments([]);
    setPendingSlot(null);
  }

  function openCreateMatchModal() {
    if (!activeEventItem) {
      return;
    }

    resetMatchForm();
    setMatchTitleDraft(`Partida ${activeEventItem.matches.length + 1}`);
    setMatchModal({ mode: "create" });
  }

  function openEditMatchModal(matchItem: EventMatchItem) {
    const selectedPlayerIds = [
      ...new Set([
        ...(matchItem.homeTeam?.players.map((lineup) => lineup.player.id) ?? []),
        ...(matchItem.awayTeam?.players.map((lineup) => lineup.player.id) ?? []),
      ]),
    ];
    const assignedPositionIds = Object.fromEntries(
      [
        ...(matchItem.homeTeam?.players ?? []),
        ...(matchItem.awayTeam?.players ?? []),
      ].map((lineup) => [lineup.player.id, lineup.assignedPosition?.id ?? null]),
    ) as Record<string, string | null>;

    setMatchModal({ mode: "edit", targetId: matchItem.match.id });
    setMatchTitleDraft(matchItem.match.title);
    setMatchHomeTeamNameDraft(matchItem.homeTeam?.team.name ?? "Time A");
    setMatchAwayTeamNameDraft(matchItem.awayTeam?.team.name ?? "Time B");
    setMatchHomeScoreDraft(String(matchItem.homeTeam?.team.score ?? 0));
    setMatchAwayScoreDraft(String(matchItem.awayTeam?.team.score ?? 0));
    setMatchSelectedPlayerIds(selectedPlayerIds);
    setMatchHomePlayerIds(matchItem.homeTeam?.players.map((lineup) => lineup.player.id) ?? []);
    setMatchAwayPlayerIds(matchItem.awayTeam?.players.map((lineup) => lineup.player.id) ?? []);
    setMatchAssignedPositionIds(assignedPositionIds);
    setMatchFormationCounts(
      buildMatchFormationCountsFromLineup(
        modalityPositions,
        matchItem.homeTeam?.players.map((lineup) => lineup.player.id) ?? [],
        matchItem.awayTeam?.players.map((lineup) => lineup.player.id) ?? [],
        assignedPositionIds,
      ),
    );
    setHomeFormationId(matchItem.homeTeam?.team.formation_id ?? null);
    setAwayFormationId(matchItem.awayTeam?.team.formation_id ?? null);
    setHomeSlotAssignments([]);
    setAwaySlotAssignments([]);
    setPendingSlot(null);
  }

  function closeMatchModal() {
    setMatchModal(null);
    setIsSubmittingMatch(false);
    resetMatchForm();
  }

  function toggleMatchSelectedPlayer(playerId: string) {
    const isSelected = matchSelectedPlayerIds.includes(playerId);

    if (isSelected) {
      setMatchSelectedPlayerIds((currentValue) => currentValue.filter((id) => id !== playerId));
      setMatchHomePlayerIds((currentValue) => currentValue.filter((id) => id !== playerId));
      setMatchAwayPlayerIds((currentValue) => currentValue.filter((id) => id !== playerId));
      setMatchAssignedPositionIds((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[playerId];
        return nextValue;
      });
      return;
    }

    const maxPlayers = (overview?.modality.players_per_team ?? 0) * 2;
    if (maxPlayers > 0 && matchSelectedPlayerIds.length >= maxPlayers) {
      return; // limite atingido
    }

    setMatchSelectedPlayerIds((currentValue) => [...currentValue, playerId]);
  }

  function toggleMatchPlayer(side: "home" | "away", playerId: string) {
    if (!matchSelectedPlayerIds.includes(playerId)) {
      setMatchSelectedPlayerIds((currentValue) => [...currentValue, playerId]);
    }

    if (side === "home") {
      if (matchHomePlayerIds.includes(playerId)) {
        setMatchHomePlayerIds((currentValue) => currentValue.filter((id) => id !== playerId));
        return;
      }

      setMatchHomePlayerIds((currentValue) => [...currentValue.filter((id) => id !== playerId), playerId]);
      setMatchAwayPlayerIds((currentValue) => currentValue.filter((id) => id !== playerId));
      return;
    }

    if (matchAwayPlayerIds.includes(playerId)) {
      setMatchAwayPlayerIds((currentValue) => currentValue.filter((id) => id !== playerId));
      return;
    }

    setMatchAwayPlayerIds((currentValue) => [...currentValue.filter((id) => id !== playerId), playerId]);
    setMatchHomePlayerIds((currentValue) => currentValue.filter((id) => id !== playerId));
  }

  function handleTacticalSlotPress(slot: TacticalFormationSlot, team: "home" | "away") {
    // Toggle: clicar no mesmo slot deseleciona; clicar em outro seleciona
    if (pendingSlot?.slotId === slot.id && pendingSlot.team === team) {
      setPendingSlot(null);
    } else {
      setPendingSlot({ slotId: slot.id, team });
    }
  }

  function assignPlayerToPendingSlot(playerId: string, playerName: string, team: "home" | "away") {
    if (!pendingSlot || pendingSlot.team !== team) return;

    // Garante que o jogador está no time correto (e remove do outro se necessário)
    if (team === "home") {
      setMatchHomePlayerIds((prev) => prev.includes(playerId) ? prev : [...prev, playerId]);
      setMatchAwayPlayerIds((prev) => prev.filter((id) => id !== playerId));
      // Remove assignment do time adversário se havia
      setAwaySlotAssignments((prev) => prev.filter((a) => a.playerId !== playerId));
    } else {
      setMatchAwayPlayerIds((prev) => prev.includes(playerId) ? prev : [...prev, playerId]);
      setMatchHomePlayerIds((prev) => prev.filter((id) => id !== playerId));
      // Remove assignment do time adversário se havia
      setHomeSlotAssignments((prev) => prev.filter((a) => a.playerId !== playerId));
    }

    const setAssignments = team === "home" ? setHomeSlotAssignments : setAwaySlotAssignments;
    setAssignments((prev) => {
      const withoutSlot = prev.filter((a) => a.slotId !== pendingSlot.slotId);
      const withoutPlayer = withoutSlot.filter((a) => a.playerId !== playerId);
      return [
        ...withoutPlayer,
        { slotId: pendingSlot.slotId, playerId, playerName },
      ];
    });
    setPendingSlot(null);
  }

  function copyExistingTeamToMatchDraft(side: "home" | "away", sourceTeamId: string) {
    const sourceTeam = (activeEventItem?.matches ?? [])
      .flatMap((matchItem) => [matchItem.homeTeam, matchItem.awayTeam])
      .find((team) => team?.team.id === sourceTeamId);

    if (!sourceTeam) {
      return;
    }

    const sourceIds = sourceTeam.players.map((lineup) => lineup.player.id);
    const sourceAssignedPositionIds = Object.fromEntries(
      sourceTeam.players.map((lineup) => [lineup.player.id, lineup.assignedPosition?.id ?? null]),
    ) as Record<string, string | null>;

    if (side === "home") {
      setMatchHomeTeamNameDraft(sourceTeam.team.name);
      setMatchHomePlayerIds(sourceIds);
      setMatchAwayPlayerIds((currentValue) => currentValue.filter((id) => !sourceIds.includes(id)));
      setMatchSelectedPlayerIds((currentValue) => [
        ...new Set([...currentValue.filter((id) => !sourceIds.includes(id)), ...sourceIds]),
      ]);
      setMatchAssignedPositionIds((currentValue) => ({
        ...currentValue,
        ...sourceAssignedPositionIds,
      }));
      return;
    }

    setMatchAwayTeamNameDraft(sourceTeam.team.name);
    setMatchAwayPlayerIds(sourceIds);
    setMatchHomePlayerIds((currentValue) => currentValue.filter((id) => !sourceIds.includes(id)));
    setMatchSelectedPlayerIds((currentValue) => [
      ...new Set([...currentValue.filter((id) => !sourceIds.includes(id)), ...sourceIds]),
    ]);
    setMatchAssignedPositionIds((currentValue) => ({
      ...currentValue,
      ...sourceAssignedPositionIds,
    }));
  }

  function updateMatchFormationCount(positionId: string, value: string) {
    const nextValue = value.replace(/[^0-9]/g, "");
    setMatchFormationCounts((currentValue) => ({
      ...currentValue,
      [positionId]: nextValue,
    }));
  }

  function handleAutoGenerateMatch() {
    try {
      const generatedTeams = autoGenerateMatchTeamsByPositions({
        selectedPlayerIds: matchSelectedPlayerIds,
        participants: activeParticipants,
        positions: modalityPositions,
        formationCounts: matchFormationCounts,
      });

      setMatchHomePlayerIds(generatedTeams.homePlayerIds);
      setMatchAwayPlayerIds(generatedTeams.awayPlayerIds);
      setMatchAssignedPositionIds(generatedTeams.assignedPositionIds);

      // Sincroniza os slots do campo tático com as posições atribuídas
      const homeFormation = tacticalFormations.find((f) => f.id === homeFormationId) ?? null;
      const awayFormation = tacticalFormations.find((f) => f.id === awayFormationId) ?? null;
      setHomeSlotAssignments(
        buildSlotAssignmentsFromPositions(generatedTeams.homePlayerIds, generatedTeams.assignedPositionIds, homeFormation, activeParticipants),
      );
      setAwaySlotAssignments(
        buildSlotAssignmentsFromPositions(generatedTeams.awayPlayerIds, generatedTeams.assignedPositionIds, awayFormation, activeParticipants),
      );

      setMessage({
        tone: "success",
        text: `Times montados priorizando posicoes e equilibrando notas: ${generatedTeams.homeRating.toFixed(2)} x ${generatedTeams.awayRating.toFixed(2)}.`,
      });
    } catch (generationError) {
      setMessage({ tone: "error", text: getReadableError(generationError) });
    }
  }

  async function handleSaveMatch() {
    if (!activeEventItem || !profile || !canManageWeeklyPolls) {
      return;
    }

    const homeScore = Number(matchHomeScoreDraft);
    const awayScore = Number(matchAwayScoreDraft);
    const selectedIds = [...new Set(matchSelectedPlayerIds)];
    const assignedIds = [...new Set([...matchHomePlayerIds, ...matchAwayPlayerIds])];

    if (!matchTitleDraft.trim()) {
      setMessage({ tone: "error", text: "Informe um titulo para a partida." });
      return;
    }

    if (selectedIds.length < 2) {
      setMessage({
        tone: "error",
        text: "Selecione os jogadores que entram nessa partida antes de salvar.",
      });
      return;
    }

    if (matchHomePlayerIds.length === 0 || matchAwayPlayerIds.length === 0) {
      setMessage({
        tone: "error",
        text: "Distribua os jogadores selecionados entre os dois times.",
      });
      return;
    }

    if (assignedIds.length !== selectedIds.length) {
      setMessage({
        tone: "error",
        text: "Todos os jogadores selecionados precisam estar alocados em um dos dois times.",
      });
      return;
    }

    if (!Number.isInteger(homeScore) || homeScore < 0 || !Number.isInteger(awayScore) || awayScore < 0) {
      setMessage({ tone: "error", text: "Informe placares validos para os dois times." });
      return;
    }

    setIsSubmittingMatch(true);
    setMessage(null);

    try {
      if (matchModal?.mode === "edit" && matchModal.targetId) {
        const currentMatch =
          activeEventItem.matches.find((item) => item.match.id === matchModal.targetId) ?? null;

        if (!currentMatch?.homeTeam || !currentMatch.awayTeam) {
          throw new Error("Nao foi possivel localizar os times dessa partida.");
        }

        await updateEventMatch({
          matchId: currentMatch.match.id,
          title: matchTitleDraft.trim(),
          homeTeamId: currentMatch.homeTeam.team.id,
          awayTeamId: currentMatch.awayTeam.team.id,
          homeTeamName: matchHomeTeamNameDraft.trim() || "Time A",
          awayTeamName: matchAwayTeamNameDraft.trim() || "Time B",
          homeScore,
          awayScore,
          homeFormationId,
          awayFormationId,
          homePlayers: buildLineupInput(matchHomePlayerIds, matchAssignedPositionIds),
          awayPlayers: buildLineupInput(matchAwayPlayerIds, matchAssignedPositionIds),
        });
      } else {
        await createEventMatch({
          eventId: activeEventItem.event.id,
          title: matchTitleDraft.trim(),
          createdBy: profile.id,
          homeTeamName: matchHomeTeamNameDraft.trim() || "Time A",
          awayTeamName: matchAwayTeamNameDraft.trim() || "Time B",
          homeFormationId,
          awayFormationId,
          homePlayers: buildLineupInput(matchHomePlayerIds, matchAssignedPositionIds),
          awayPlayers: buildLineupInput(matchAwayPlayerIds, matchAssignedPositionIds),
        });
      }

      await reloadScreenData();
      closeMatchModal();
      setMessage({ tone: "success", text: "Partida salva no evento." });
    } catch (saveError) {
      setMessage({ tone: "error", text: getReadableError(saveError) });
    } finally {
      setIsSubmittingMatch(false);
    }
  }

  function confirmCompleteMatch(matchItem: EventMatchItem) {
    Alert.alert(
      "Encerrar partida",
      "Depois de encerrar a partida, o placar fica registrado para consulta e para montar a proxima.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Encerrar partida",
          onPress: () => {
            void handleCompleteMatch(matchItem);
          },
        },
      ],
    );
  }

  async function handleCompleteMatch(matchItem: EventMatchItem) {
    setEventActionId(`match-${matchItem.match.id}`);
    setMessage(null);

    try {
      await completeEventMatch(matchItem.match.id);
      await reloadScreenData();
      setMessage({ tone: "success", text: `${matchItem.match.title} foi encerrada.` });
    } catch (completeError) {
      setMessage({ tone: "error", text: getReadableError(completeError) });
    } finally {
      setEventActionId(null);
    }
  }

  async function handleVote(ballot: EventPollBallot, optionId: string | null, targetParticipantId: string | null) {
    if (!currentViewerParticipantId) {
      setMessage({
        tone: "error",
        text: "Seu usuario precisa estar na lista do evento para votar nessa enquete.",
      });
      return;
    }

    setVotingPollId(ballot.poll.id);
    setMessage(null);

    try {
      await upsertEventPollVote({
        pollId: ballot.poll.id,
        voterParticipantId: currentViewerParticipantId,
        optionId,
        targetParticipantId,
      });
      applyVoteToActiveEvent(ballot, optionId, targetParticipantId);
      setMessage({ tone: "success", text: "Voto registrado no evento." });
    } catch (voteError) {
      setMessage({ tone: "error", text: getReadableError(voteError) });
    } finally {
      setVotingPollId(null);
    }
  }

  function renderStateRail(status: Event["status"] | null) {
    const stateLabels = [
      "Evento nao criado",
      "Evento criado",
      "Evento fechado",
      "Evento encerrado",
    ];
    const activeStateIndex = getEventStateIndex(status);

    return (
      <View style={styles.stateRailCompact}>
        {stateLabels.map((stateLabel, index) => {
          const isCompleted = index < activeStateIndex;
          const isActive = index === activeStateIndex;

          return (
            <View
              key={stateLabel}
              style={[
                styles.statePill,
                isCompleted && styles.stateStepCompleted,
                isActive && styles.stateStepActive,
              ]}>
              <Text
                style={[
                  styles.stateStepLabel,
                  (isCompleted || isActive) && styles.stateStepLabelActive,
                ]}>
                {index + 1}. {stateLabel}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  function renderAccordionSection({
    title,
    subtitle,
    isExpanded,
    onToggle,
    headerAction,
    children,
  }: {
    title: string;
    subtitle: string;
    isExpanded: boolean;
    onToggle: () => void;
    headerAction?: ReactNode;
    children: ReactNode;
  }) {
    return (
      <View style={styles.sectionCard}>
        <View style={styles.accordionHeader}>
          <View style={styles.accordionHeaderContent}>
            <Text style={styles.workspaceTitle}>{title}</Text>
            <Text style={styles.panelText}>{subtitle}</Text>
          </View>
          <View style={styles.accordionHeaderActions}>
            {headerAction}
            <Pressable onPress={onToggle} style={styles.inlineActionButton}>
              <Text style={styles.inlineActionText}>{isExpanded ? "Recolher" : "Abrir"}</Text>
            </Pressable>
          </View>
        </View>
        {isExpanded ? <View style={styles.accordionContent}>{children}</View> : null}
      </View>
    );
  }

  function renderRosterList(items: WeeklyEventParticipantItem[], emptyText: string) {
    if (items.length === 0) {
      return <Text style={styles.panelText}>{emptyText}</Text>;
    }

    return items.map((item) => (
      <View key={item.participant.id} style={styles.listCard}>
        <View style={styles.listCardHeader}>
          <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} />
          <View style={styles.flex}>
            <Text style={styles.panelTitle}>{item.player.full_name}</Text>
            <Text style={styles.panelText}>
              {item.priorityGroup
                ? `${item.priorityGroup.priority_rank}. ${item.priorityGroup.name}`
                : "Sem prioridade definida"}
            </Text>
            <Text style={styles.panelText}>
              Posicoes:{" "}
              {item.preferredPositions.length > 0
                ? item.preferredPositions.map((position) => position.name).join(", ")
                : "Nao informadas"}
            </Text>
          </View>
        </View>
      </View>
    ));
  }

  function renderPollCard(ballot: EventPollBallot) {
    const summary = activeEventPollResultMap.get(ballot.poll.id) ?? null;
    const selectedId =
      ballot.poll.selection_mode === "predefined_options"
        ? ballot.currentVote?.option_id ?? null
        : ballot.currentVote?.target_participant_id ?? null;

    return (
      <View key={ballot.poll.id} style={styles.innerCard}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.innerCardTitle}>{ballot.poll.title}</Text>
            <Text style={styles.innerCardMeta}>
              {ballot.poll.template_id ? "Modelo recorrente" : "Enquete avulsa"} | {formatPollStatus(ballot.poll.status)}
              {summary ? ` | ${summary.totalVotes} voto(s)` : ""}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{formatPollStatus(ballot.poll.status)}</Text>
          </View>
        </View>

        {ballot.poll.description ? <Text style={styles.innerCardText}>{ballot.poll.description}</Text> : null}

        {ballot.poll.status === "open" ? (
          currentViewerParticipantId ? (
            <View style={styles.voteGrid}>
              {ballot.options.map((option) => {
                const isSelected = selectedId === option.id;

                return (
                  <Pressable
                    key={option.id}
                    onPress={() => void handleVote(ballot, option.optionId, option.targetParticipantId)}
                    disabled={votingPollId === ballot.poll.id}
                    style={[
                      styles.voteOption,
                      isSelected && styles.voteOptionSelected,
                      votingPollId === ballot.poll.id && styles.buttonDisabled,
                    ]}>
                    <View style={styles.rowWithAvatar}>
                      <PlayerAvatar name={option.label} photoUrl={option.photoUrl} size={34} />
                      <View style={styles.flex}>
                        <Text style={[styles.voteOptionTitle, isSelected && styles.voteOptionTitleSelected]}>
                          {option.label}
                        </Text>
                        {option.description ? (
                          <Text
                            style={[
                              styles.voteOptionDescription,
                              isSelected && styles.voteOptionDescriptionSelected,
                            ]}>
                            {option.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.panelText}>
              Essa enquete esta aberta, mas o seu usuario nao esta na lista do evento para votar.
            </Text>
          )
        ) : null}

        {summary && summary.entries.length > 0 ? (
          <View style={styles.resultList}>
            {summary.entries.map((entry) => (
              <View key={entry.id} style={styles.rowBetween}>
                <View style={styles.rowWithAvatar}>
                  <PlayerAvatar name={entry.label} photoUrl={entry.photoUrl} size={32} />
                  <View style={styles.flex}>
                    <Text style={styles.eventPersonName}>{entry.label}</Text>
                    {entry.description ? <Text style={styles.eventPersonMeta}>{entry.description}</Text> : null}
                  </View>
                </View>
                <Text style={styles.voteCount}>{entry.votes}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.panelText}>Essa enquete ainda nao recebeu votos.</Text>
        )}
      </View>
    );
  }

  function renderMatchesSection(
    matches: EventMatchItem[],
    participants: WeeklyEventParticipantItem[],
    allowManage: boolean,
  ) {
    return (
      <View style={styles.sectionStack}>
        {matches.length > 0 ? (
          matches.map((matchItem) => (
            <View key={matchItem.match.id} style={styles.innerCard}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={styles.innerCardTitle}>{matchItem.match.title}</Text>
                  <Text style={styles.innerCardMeta}>
                    {matchItem.homeTeam?.team.name ?? "Time A"} {matchItem.homeTeam?.team.score ?? 0} x{" "}
                    {matchItem.awayTeam?.team.score ?? 0} {matchItem.awayTeam?.team.name ?? "Time B"}
                  </Text>
                </View>
                {allowManage ? (
                  <View style={styles.listActions}>
                    <Pressable onPress={() => openEditMatchModal(matchItem)} style={styles.inlineActionButton}>
                      <Text style={styles.inlineActionText}>Editar</Text>
                    </Pressable>
                    {matchItem.match.status !== "completed" ? (
                      <Pressable
                        onPress={() => confirmCompleteMatch(matchItem)}
                        disabled={eventActionId === `match-${matchItem.match.id}`}
                        style={[
                          styles.inlineDangerButton,
                          eventActionId === `match-${matchItem.match.id}` && styles.buttonDisabled,
                        ]}>
                        <Text style={styles.inlineDangerText}>
                          {eventActionId === `match-${matchItem.match.id}` ? "Encerrando..." : "Encerrar"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>

                <View style={styles.matchTeams}>
                  <View style={styles.selectionCard}>
                    <Text style={styles.selectionCardTitle}>{matchItem.homeTeam?.team.name ?? "Time A"}</Text>
                    <Text style={styles.selectionCardText}>
                      Nota total{" "}
                      {calculateTeamRating(
                        (matchItem.homeTeam?.players ?? []).map((lineup) => lineup.player.id),
                        participants,
                      ).toFixed(2)}
                    </Text>
                    {(matchItem.homeTeam?.players ?? []).length > 0 ? (
                      (matchItem.homeTeam?.players ?? []).map((lineup) => (
                        <View key={`${matchItem.match.id}-home-${lineup.player.id}`} style={styles.matchPlayerRow}>
                          <PlayerAvatar
                            name={lineup.player.full_name}
                            photoUrl={lineup.player.photo_url}
                            size={30}
                          />
                          <View style={styles.flex}>
                            <Text style={styles.selectionCardText}>{lineup.player.full_name}</Text>
                            {lineup.assignedPosition ? (
                              <Text style={styles.eventPersonMeta}>{lineup.assignedPosition.name}</Text>
                            ) : null}
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.panelText}>Sem jogadores escalados.</Text>
                    )}
                </View>

                <View style={styles.selectionCard}>
                  <Text style={styles.selectionCardTitle}>{matchItem.awayTeam?.team.name ?? "Time B"}</Text>
                  <Text style={styles.selectionCardText}>
                    Nota total{" "}
                    {calculateTeamRating(
                      (matchItem.awayTeam?.players ?? []).map((lineup) => lineup.player.id),
                      participants,
                    ).toFixed(2)}
                  </Text>
                  {(matchItem.awayTeam?.players ?? []).length > 0 ? (
                    (matchItem.awayTeam?.players ?? []).map((lineup) => (
                      <View key={`${matchItem.match.id}-away-${lineup.player.id}`} style={styles.matchPlayerRow}>
                        <PlayerAvatar
                          name={lineup.player.full_name}
                          photoUrl={lineup.player.photo_url}
                          size={30}
                        />
                        <View style={styles.flex}>
                          <Text style={styles.selectionCardText}>{lineup.player.full_name}</Text>
                          {lineup.assignedPosition ? (
                            <Text style={styles.eventPersonMeta}>{lineup.assignedPosition.name}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.panelText}>Sem jogadores escalados.</Text>
                  )}
                </View>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.panelText}>Nenhuma partida registrada ainda para este evento.</Text>
        )}
      </View>
    );
  }

  // ── Novo header fixo ──────────────────────────────────────────────────────────

  function renderEventHeader() {
    const hasPrev = viewedEventIndex < timeline.length - 1;
    const hasNext = viewedEventIndex > 0;

    const tabConfig: { key: EventSectionKey; label: string; count: number }[] = [
      {
        key: "roster",
        label: "Quórum",
        count: viewedEventItem
          ? viewedRoster.length
          : 0,
      },
      {
        key: "polls",
        label: "Enquetes",
        count: viewedEventItem
          ? isViewingActiveEvent
            ? eventPollBallots.length
            : viewedEventItem.pollResults.length
          : 0,
      },
      {
        key: "matches",
        label: "Partidas",
        count: viewedEventItem?.matches.length ?? 0,
      },
    ];

    return (
      <View style={newStyles.header}>
        {/* Seletor de conta (quando há mais de uma) */}
        {availableAccounts.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={newStyles.accountScroll}>
            {availableAccounts.map((item) => {
              const isSelected = item.account.id === selectedAccess?.account.id;
              return (
                <Pressable
                  key={item.account.id}
                  onPress={() => { setSelectedAccountId(item.account.id); setViewedEventIndex(0); }}
                  style={[newStyles.accountChip, isSelected && newStyles.accountChipActive]}>
                  <Text style={[newStyles.accountChipText, isSelected && newStyles.accountChipTextActive]}>
                    {item.account.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Data + navegação */}
        {viewedEventItem ? (
          <>
            <View style={newStyles.navRow}>
              <Pressable
                onPress={() => { setViewedEventIndex((i) => i + 1); setActiveEventTab("roster"); }}
                disabled={!hasPrev}
                style={[newStyles.navBtn, !hasPrev && newStyles.navBtnDisabled]}>
                <Text style={newStyles.navBtnText}>‹</Text>
              </Pressable>

              <View style={newStyles.navCenter}>
                <Text style={newStyles.navWeekday}>{formatEventWeekday(viewedEventItem.event.starts_at)}</Text>
                <Text style={newStyles.navDate}>{formatEventDay(viewedEventItem.event.starts_at)}</Text>
              </View>

              <Pressable
                onPress={() => { setViewedEventIndex((i) => i - 1); setActiveEventTab("roster"); }}
                disabled={!hasNext}
                style={[newStyles.navBtn, !hasNext && newStyles.navBtnDisabled]}>
                <Text style={newStyles.navBtnText}>›</Text>
              </Pressable>
            </View>

            {/* Grupo + horário + status */}
            <View style={newStyles.groupRow}>
              <View style={newStyles.groupInfo}>
                <Text style={newStyles.groupName} numberOfLines={1}>
                  {selectedAccess?.account.name ?? ""}
                </Text>
                <Text style={newStyles.groupMeta} numberOfLines={1}>
                  {overview?.modality.name} · {formatEventTime(viewedEventItem.event.starts_at)} – {formatEventTime(viewedEventItem.event.ends_at)}
                </Text>
              </View>
              {(() => {
                const s = getEventStatusStyle(viewedEventItem.event.status);
                return (
                  <View style={[newStyles.statusBadge, { backgroundColor: s.bg }]}>
                    <View style={[newStyles.statusDot, { backgroundColor: s.dot }]} />
                    <Text style={[newStyles.statusBadgeText, { color: s.text }]}>{s.label}</Text>
                  </View>
                );
              })()}
            </View>

            {/* Ações admin do evento ativo */}
            {isViewingActiveEvent && canManageWeeklyList && activeEventItem ? (
              <View style={newStyles.adminRow}>
                {activeEventItem.event.status === "draft" ? (
                  <Pressable
                    onPress={() => confirmCloseList(activeEventItem.event.id)}
                    disabled={eventActionId === `close-${activeEventItem.event.id}`}
                    style={[newStyles.adminBtn, (eventActionId === `close-${activeEventItem.event.id}`) && newStyles.adminBtnDisabled]}>
                    <Text style={newStyles.adminBtnText}>
                      {eventActionId === `close-${activeEventItem.event.id}` ? "Fechando lista…" : "Fechar lista"}
                    </Text>
                  </Pressable>
                ) : activeEventItem.event.status === "published" ? (
                  <Pressable
                    onPress={() => confirmCompleteEvent(activeEventItem.event.id)}
                    disabled={eventActionId === `complete-${activeEventItem.event.id}`}
                    style={[newStyles.adminBtn, newStyles.adminBtnDanger, (eventActionId === `complete-${activeEventItem.event.id}`) && newStyles.adminBtnDisabled]}>
                    <Text style={[newStyles.adminBtnText, newStyles.adminBtnDangerText]}>
                      {eventActionId === `complete-${activeEventItem.event.id}` ? "Encerrando…" : "Encerrar evento"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {/* Criar novo evento — visível no header quando admin e não há evento ativo */}
        {!activeEventItem && canManageWeeklyList ? (
          <View style={newStyles.adminRow}>
            <Pressable
              onPress={() => openCreateEventModal()}
              disabled={isCreatingEvent}
              style={[newStyles.adminBtn, isCreatingEvent && newStyles.adminBtnDisabled]}>
              <Text style={newStyles.adminBtnText}>
                {isCreatingEvent ? "Criando evento…" : "＋ Criar novo evento"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Tab bar */}
        <View style={newStyles.tabBar}>
          {tabConfig.map((tab) => {
            const isActive = activeEventTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveEventTab(tab.key)}
                style={newStyles.tabItem}>
                <View style={newStyles.tabInner}>
                  <Text style={[newStyles.tabLabel, isActive && newStyles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                  {tab.count > 0 ? (
                    <View style={[newStyles.tabBadge, isActive && newStyles.tabBadgeActive]}>
                      <Text style={[newStyles.tabBadgeText, isActive && newStyles.tabBadgeTextActive]}>
                        {tab.count}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {isActive ? <View style={newStyles.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  // ── Conteúdo das tabs ─────────────────────────────────────────────────────────

  function renderTabContent() {
    if (!selectedAccess || !overview) {
      return null;
    }

    // Sem evento ativo: mostrar painel de criação para admins
    if (!viewedEventItem) {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.workspaceTitle}>Nenhum evento ativo</Text>
          <Text style={styles.panelText}>
            Nao ha chamada aberta agora. Quando voce criar a chamada, o BoraJogar monta a lista inicial com quem entra sempre.
          </Text>
          {canManageWeeklyList ? (
            <Pressable
              onPress={() => openCreateEventModal()}
              disabled={isCreatingEvent}
              style={[styles.primaryButton, isCreatingEvent && styles.buttonDisabled]}>
              {isCreatingEvent ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Criar chamada para jogo</Text>
              )}
            </Pressable>
          ) : (
            <Text style={styles.panelText}>Aguarde o administrador criar a proxima chamada.</Text>
          )}
        </View>
      );
    }

    const isDraft = isViewingActiveEvent && activeEventItem?.event.status === "draft";
    const isPublished = isViewingActiveEvent && activeEventItem?.event.status === "published";
    const canEdit = isViewingActiveEvent && (canManageWeeklyList || canManageWeeklyPolls);

    // ── QUÓRUM ────────────────────────────────────────────────────────────────
    if (activeEventTab === "roster") {
      const quorumPct = Math.min(
        100,
        viewedEventItem.event.max_players > 0
          ? Math.round((viewedRoster.length / viewedEventItem.event.max_players) * 100)
          : 0,
      );
      const quorumReached = viewedRoster.length >= viewedEventItem.event.max_players;

      return (
        <View style={newStyles.tabContent}>
          {/* Progresso do quórum */}
          <View style={newStyles.quorumCard}>
            <View style={newStyles.quorumCardRow}>
              <View>
                <Text style={newStyles.quorumCount}>
                  {viewedRoster.length}
                  <Text style={newStyles.quorumMax}>/{viewedEventItem.event.max_players}</Text>
                </Text>
                <Text style={newStyles.quorumLabel}>Confirmações / mínimo</Text>
              </View>
              <View style={[newStyles.quorumPill, quorumReached ? newStyles.quorumPillOk : newStyles.quorumPillPending]}>
                <Text style={[newStyles.quorumPillText, quorumReached ? newStyles.quorumPillTextOk : newStyles.quorumPillTextPending]}>
                  {quorumReached ? "✓ Quórum atingido" : `Faltam ${viewedEventItem.event.max_players - viewedRoster.length}`}
                </Text>
              </View>
            </View>
            <View style={newStyles.progressTrack}>
              <View
                style={[
                  newStyles.progressBar,
                  { width: `${quorumPct}%` as unknown as number },
                  quorumReached ? newStyles.progressBarOk : newStyles.progressBarPending,
                ]}
              />
            </View>
          </View>

          {/* Em montagem: dois painéis (Na lista / Fora da lista) */}
          {isDraft ? (
            <View style={newStyles.draftColumns}>
              {/* Na lista */}
              <View style={newStyles.draftColumn}>
                <Text style={newStyles.columnTitle}>Na lista</Text>
                {activeParticipants.length > 0 ? (
                  activeParticipants.map((item) => (
                    <View key={item.participant.id} style={newStyles.playerRow}>
                      <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} size={36} />
                      <View style={newStyles.flex}>
                        <Text style={newStyles.playerName}>{item.player.full_name}</Text>
                        <Text style={newStyles.playerMeta}>
                          {item.preferredPositions.length > 0
                            ? item.preferredPositions.map((p) => p.name).join(", ")
                            : "Posições não informadas"}
                        </Text>
                      </View>
                      {canManageWeeklyList ? (
                        <Pressable
                          onPress={() => void handleRemovePlayerFromWeeklyList(item)}
                          disabled={eventActionId === item.participant.id}
                          style={newStyles.inlineDanger}>
                          <Text style={newStyles.inlineDangerText}>
                            {eventActionId === item.participant.id ? "…" : "Retirar"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <Text style={newStyles.emptyText}>Nenhum jogador ainda.</Text>
                )}
              </View>

              {/* Fora da lista */}
              <View style={newStyles.draftColumn}>
                <View style={newStyles.columnTitleRow}>
                  <Text style={newStyles.columnTitle}>Fora</Text>
                  {canManageWeeklyList && availableWeeklyPlayers.length > 0 ? (
                    <Pressable
                      onPress={() => {
                        const allIds = new Set(availableWeeklyPlayers.map((p) => p.player.id));
                        const allSelected = availableWeeklyPlayers.every((p) =>
                          batchSelectedPlayerIds.has(p.player.id),
                        );
                        setBatchSelectedPlayerIds(allSelected ? new Set() : allIds);
                      }}
                      style={newStyles.selectAllLink}>
                      <Text style={newStyles.selectAllText}>
                        {availableWeeklyPlayers.every((p) => batchSelectedPlayerIds.has(p.player.id))
                          ? "Desmarcar todos"
                          : "Marcar todos"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {availableWeeklyPlayers.length > 0 ? (
                  <>
                    {availableWeeklyPlayers.map((item) => {
                      const isSelected = batchSelectedPlayerIds.has(item.player.id);
                      return (
                        <Pressable
                          key={item.player.id}
                          onPress={() => {
                            if (!canManageWeeklyList) return;
                            setBatchSelectedPlayerIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.player.id)) next.delete(item.player.id);
                              else next.add(item.player.id);
                              return next;
                            });
                          }}
                          style={[newStyles.playerRow, isSelected && newStyles.playerRowSelected]}>
                          {canManageWeeklyList ? (
                            <View style={[newStyles.checkbox, isSelected && newStyles.checkboxSelected]}>
                              {isSelected ? <Text style={newStyles.checkboxTick}>✓</Text> : null}
                            </View>
                          ) : null}
                          <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} size={36} />
                          <View style={newStyles.flex}>
                            <Text style={newStyles.playerName}>{item.player.full_name}</Text>
                          </View>
                        </Pressable>
                      );
                    })}

                    {canManageWeeklyList && batchSelectedPlayerIds.size > 0 ? (
                      <Pressable
                        onPress={() => void handleBatchAddPlayersToWeeklyList()}
                        disabled={isBatchAdding}
                        style={[newStyles.batchAddButton, isBatchAdding && newStyles.batchAddButtonDisabled]}>
                        {isBatchAdding ? (
                          <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                          <Text style={newStyles.batchAddButtonText}>
                            Incluir {batchSelectedPlayerIds.size} jogador{batchSelectedPlayerIds.size > 1 ? "es" : ""}
                          </Text>
                        )}
                      </Pressable>
                    ) : null}
                  </>
                ) : (
                  <Text style={newStyles.emptyText}>Todos incluídos.</Text>
                )}
              </View>
            </View>
          ) : (
            // Lista consolidada (evento fechado ou histórico)
            <View>
              <Text style={newStyles.sectionLabel}>Confirmados ({viewedRoster.length})</Text>
              {viewedRoster.length > 0 ? (
                viewedRoster.map((item) => (
                  <View key={item.participant.id} style={newStyles.playerCard}>
                    <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} size={36} />
                    <View style={newStyles.flex}>
                      <Text style={newStyles.playerName}>{item.player.full_name}</Text>
                      {item.preferredPositions.length > 0 ? (
                        <Text style={newStyles.playerMeta}>
                          {item.preferredPositions.map((p) => p.name).join(", ")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              ) : (
                <Text style={newStyles.emptyText}>Nenhum jogador registrado.</Text>
              )}
            </View>
          )}
        </View>
      );
    }

    // ── ENQUETES ──────────────────────────────────────────────────────────────
    if (activeEventTab === "polls") {
      return (
        <View style={newStyles.tabContent}>
          {/* Botão nova enquete (admin + evento ativo + publicado) */}
          {isPublished && canManageWeeklyPolls ? (
            <Pressable onPress={openCreateEventPollModal} style={newStyles.addButton}>
              <Text style={newStyles.addButtonText}>+ Nova enquete</Text>
            </Pressable>
          ) : null}

          {isViewingActiveEvent ? (
            eventPollBallots.length > 0 ? (
              <View style={newStyles.sectionStack}>
                {eventPollBallots.map((ballot) => renderPollCard(ballot))}
              </View>
            ) : (
              <View style={newStyles.emptyState}>
                <Text style={newStyles.emptyStateEmoji}>🗳️</Text>
                <Text style={newStyles.emptyStateTitle}>Nenhuma enquete</Text>
                <Text style={newStyles.emptyStateText}>
                  {isPublished ? "Crie a primeira enquete para este evento." : "As enquetes ficam disponíveis após fechar a lista."}
                </Text>
              </View>
            )
          ) : (
            viewedEventItem.pollResults.length > 0 ? (
              <View style={newStyles.sectionStack}>
                {viewedEventItem.pollResults.map((summary) => (
                  <View key={summary.poll.id} style={newStyles.pollCard}>
                    <Text style={newStyles.pollTitle}>{summary.poll.title}</Text>
                    <Text style={newStyles.pollMeta}>{summary.totalVotes} voto(s)</Text>
                    {summary.entries.map((entry) => (
                      <View key={entry.id} style={newStyles.pollEntry}>
                        <PlayerAvatar name={entry.label} photoUrl={entry.photoUrl} size={28} />
                        <Text style={newStyles.pollEntryLabel}>{entry.label}</Text>
                        <Text style={newStyles.pollEntryVotes}>{entry.votes}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={newStyles.emptyState}>
                <Text style={newStyles.emptyStateEmoji}>🗳️</Text>
                <Text style={newStyles.emptyStateTitle}>Sem enquetes</Text>
                <Text style={newStyles.emptyStateText}>Nenhuma enquete foi registrada neste evento.</Text>
              </View>
            )
          )}
        </View>
      );
    }

    // ── PARTIDAS ──────────────────────────────────────────────────────────────
    if (activeEventTab === "matches") {
      return (
        <View style={newStyles.tabContent}>
          {/* Botão nova partida (admin + ativo + publicado) */}
          {isPublished && canEdit ? (
            <Pressable onPress={openCreateMatchModal} style={newStyles.addButton}>
              <Text style={newStyles.addButtonText}>+ Nova partida</Text>
            </Pressable>
          ) : null}

          {viewedEventItem.matches.length > 0 ? (
            renderMatchesSection(
              viewedEventItem.matches,
              viewedEventItem.participants,
              isPublished && canManageWeeklyPolls,
            )
          ) : (
            <View style={newStyles.emptyState}>
              <Text style={newStyles.emptyStateEmoji}>⚽</Text>
              <Text style={newStyles.emptyStateTitle}>Sem partidas</Text>
              <Text style={newStyles.emptyStateText}>
                {isPublished ? "Adicione a primeira partida do evento." : "As partidas ficam disponíveis após fechar a lista."}
              </Text>
            </View>
          )}
        </View>
      );
    }

    return null;
  }

  function renderActiveEventWorkspace() {
    if (!selectedAccess || !overview) {
      return null;
    }

    if (!activeEventItem) {
      return (
        <View style={styles.sectionCard}>
          <Text style={styles.workspaceTitle}>Evento nao criado</Text>
          <Text style={styles.panelText}>
            Nao ha chamada aberta agora. Quando voce criar a chamada, o BoraJogar monta a lista inicial com quem entra sempre.
          </Text>
          {canManageWeeklyList ? (
            <Pressable
              onPress={() => openCreateEventModal()}
              disabled={isCreatingEvent}
              style={[styles.primaryButton, isCreatingEvent && styles.buttonDisabled]}>
              {isCreatingEvent ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Criar chamada para jogo</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      );
    }

    const activeEventSubtitle =
      activeEventItem.event.status === "draft"
        ? "Lista em montagem. Ajuste quem entra no jogo antes de fechar."
        : activeEventItem.event.status === "published"
          ? "Lista fechada. Agora o foco fica em enquetes e partidas."
          : "Evento encerrado com quorum, enquetes e partidas registradas.";

    return (
      <View style={styles.section}>
        <View style={styles.sectionCard}>
          <Text style={styles.workspaceTitle}>Evento atual</Text>
          <Text style={styles.panelText}>{activeEventSubtitle}</Text>

          <View style={styles.eventOverviewCard}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.eventCurrentTitle}>{activeEventItem.event.title}</Text>
                <Text style={styles.eventMeta}>
                  {selectedAccess.account.name} | {overview.modality.name} |{" "}
                  {formatEventDate(activeEventItem.event.starts_at)}
                </Text>
              </View>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{formatEventState(activeEventItem.event.status)}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricPill}>
                <Text style={styles.metricLabel}>Quorum</Text>
                <Text style={styles.metricValue}>
                  {activeParticipants.length}/{activeEventItem.event.max_players}
                </Text>
              </View>
              <View style={styles.metricPill}>
                <Text style={styles.metricLabel}>Enquetes</Text>
                <Text style={styles.metricValue}>{activeEventItem.pollResults.length}</Text>
              </View>
              <View style={styles.metricPill}>
                <Text style={styles.metricLabel}>Partidas</Text>
                <Text style={styles.metricValue}>{activeEventItem.matches.length}</Text>
              </View>
            </View>
            <View style={styles.currentStateRow}>
              <Text style={styles.currentStateLabel}>Estado atual</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{formatEventState(activeEventItem.event.status)}</Text>
              </View>
            </View>
          </View>

          {activeEventItem.event.status === "draft" ? (
            <>
              {renderAccordionSection({
                title: "Montagem da lista",
                subtitle:
                  "Inclua ou retire jogadores sem perder a ordem de prioridade definida pela conta.",
                isExpanded: resolvedActiveEventSections.roster,
                onToggle: () => toggleActiveEventSection("roster"),
                headerAction: canManageWeeklyList ? (
                  <Pressable
                    onPress={() => confirmCloseList(activeEventItem.event.id)}
                    disabled={eventActionId === `close-${activeEventItem.event.id}`}
                    style={[
                      styles.secondaryButton,
                      eventActionId === `close-${activeEventItem.event.id}` && styles.buttonDisabled,
                    ]}>
                    <Text style={styles.secondaryButtonText}>
                      {eventActionId === `close-${activeEventItem.event.id}` ? "Fechando..." : "Fechar lista"}
                    </Text>
                  </Pressable>
                ) : undefined,
                children: (
                  <View style={styles.weeklyBoard}>
                    <View style={styles.weeklyColumn}>
                      <Text style={styles.workspaceTitle}>Na lista</Text>
                      <Text style={styles.panelText}>
                        Jogadores ja inseridos na chamada atual, ordenados pela prioridade da conta.
                      </Text>

                      {activeParticipants.length > 0 ? (
                        activeParticipants.map((item) => (
                          <View key={item.participant.id} style={styles.listCard}>
                            <View style={styles.listCardHeader}>
                              <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} />
                              <View style={styles.flex}>
                                <Text style={styles.panelTitle}>{item.player.full_name}</Text>
                                <Text style={styles.panelText}>
                                  {item.priorityGroup
                                    ? `${item.priorityGroup.priority_rank}. ${item.priorityGroup.name}`
                                    : "Sem prioridade definida"}
                                </Text>
                                <Text style={styles.panelText}>
                                  Posicoes:{" "}
                                  {item.preferredPositions.length > 0
                                    ? item.preferredPositions.map((position) => position.name).join(", ")
                                    : "Nao informadas"}
                                </Text>
                              </View>
                              {canManageWeeklyList ? (
                                <Pressable
                                  onPress={() => void handleRemovePlayerFromWeeklyList(item)}
                                  disabled={eventActionId === item.participant.id}
                                  style={[
                                    styles.inlineDangerButton,
                                    eventActionId === item.participant.id && styles.buttonDisabled,
                                  ]}>
                                  <Text style={styles.inlineDangerText}>
                                    {eventActionId === item.participant.id ? "Retirando..." : "Retirar"}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.panelText}>Nenhum jogador entrou na lista ainda.</Text>
                      )}
                    </View>

                    <View style={styles.weeklyColumn}>
                      <Text style={styles.workspaceTitle}>Fora da lista</Text>
                      <Text style={styles.panelText}>
                        Jogadores elegiveis que ainda nao entraram nesta chamada.
                      </Text>

                      <View style={styles.chips}>
                        <Pressable
                          onPress={() => setWeeklyPriorityFilter("all")}
                          style={[styles.chip, weeklyPriorityFilter === "all" && styles.chipSelected]}>
                          <Text
                            style={[
                              styles.chipText,
                              weeklyPriorityFilter === "all" && styles.chipTextSelected,
                            ]}>
                            Todos
                          </Text>
                        </Pressable>
                        {overview.priorityGroups.map((group) => (
                          <Pressable
                            key={group.id}
                            onPress={() => setWeeklyPriorityFilter(group.id)}
                            style={[styles.chip, weeklyPriorityFilter === group.id && styles.chipSelected]}>
                            <Text
                              style={[
                                styles.chipText,
                                weeklyPriorityFilter === group.id && styles.chipTextSelected,
                              ]}>
                              {group.priority_rank}. {group.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      {availableWeeklyPlayers.length > 0 ? (
                        availableWeeklyPlayers.map((item) => (
                          <View key={item.player.id} style={styles.listCard}>
                            <View style={styles.listCardHeader}>
                              <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} />
                              <View style={styles.flex}>
                                <Text style={styles.panelTitle}>{item.player.full_name}</Text>
                                <Text style={styles.panelText}>
                                  {item.priorityGroup
                                    ? `${item.priorityGroup.priority_rank}. ${item.priorityGroup.name}`
                                    : "Sem prioridade definida"}
                                </Text>
                                <Text style={styles.panelText}>
                                  Posicoes:{" "}
                                  {item.preferredPositions.length > 0
                                    ? item.preferredPositions.map((position) => position.name).join(", ")
                                    : "Nao informadas"}
                                </Text>
                              </View>
                              {canManageWeeklyList ? (
                                <Pressable
                                  onPress={() => void handleAddPlayerToWeeklyList(item)}
                                  disabled={eventActionId === item.player.id}
                                  style={[
                                    styles.inlineActionButton,
                                    eventActionId === item.player.id && styles.buttonDisabled,
                                  ]}>
                                  <Text style={styles.inlineActionText}>
                                    {eventActionId === item.player.id ? "Incluindo..." : "Incluir"}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.panelText}>
                          {accountPlayers.length === 0
                            ? "Primeiro cadastre os jogadores na aba Elenco."
                            : "Nenhum jogador fora da lista para esse filtro."}
                        </Text>
                      )}
                    </View>
                  </View>
                ),
              })}
            </>
          ) : (
            <>
              {renderAccordionSection({
                title: "Quorum final",
                subtitle:
                  "Lista definitiva do evento, usada como base para enquetes e partidas.",
                isExpanded: resolvedActiveEventSections.roster,
                onToggle: () => toggleActiveEventSection("roster"),
                children: renderRosterList(
                  activeParticipants,
                  "Nenhum jogador foi mantido na lista final.",
                ),
              })}

              {renderAccordionSection({
                title: "Enquetes do evento",
                subtitle: "Vote e acompanhe o resultado parcial ou final de cada enquete.",
                isExpanded: resolvedActiveEventSections.polls,
                onToggle: () => toggleActiveEventSection("polls"),
                headerAction:
                  activeEventItem.event.status === "published" && canManageWeeklyPolls ? (
                    <Pressable onPress={openCreateEventPollModal} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>
                        {eventPollBallots.length > 0 ? "Nova enquete" : "Criar enquete"}
                      </Text>
                    </Pressable>
                  ) : undefined,
                children:
                  eventPollBallots.length > 0 ? (
                    <View style={styles.sectionStack}>
                      {eventPollBallots.map((ballot) => renderPollCard(ballot))}
                    </View>
                  ) : (
                    <Text style={styles.panelText}>
                      {activeEventItem.event.status === "published"
                        ? "Nenhuma enquete criada ainda para esse evento."
                        : "Nenhuma enquete ficou registrada nesse evento."}
                    </Text>
                  ),
              })}

              {renderAccordionSection({
                title: "Partidas",
                subtitle: "Guarde os confrontos do evento, com times e placares.",
                isExpanded: resolvedActiveEventSections.matches,
                onToggle: () => toggleActiveEventSection("matches"),
                headerAction:
                  activeEventItem.event.status === "published" &&
                  (canManageWeeklyPolls || canManageWeeklyList) ? (
                    <View style={styles.listActions}>
                      {canManageWeeklyPolls ? (
                        <Pressable onPress={openCreateMatchModal} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>Nova partida</Text>
                        </Pressable>
                      ) : null}
                      {canManageWeeklyList ? (
                        <Pressable
                          onPress={() => confirmCompleteEvent(activeEventItem.event.id)}
                          disabled={eventActionId === `complete-${activeEventItem.event.id}`}
                          style={[
                            styles.inlineDangerButton,
                            eventActionId === `complete-${activeEventItem.event.id}` && styles.buttonDisabled,
                          ]}>
                          <Text style={styles.inlineDangerText}>
                            {eventActionId === `complete-${activeEventItem.event.id}`
                              ? "Encerrando..."
                              : "Encerrar evento"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : undefined,
                children: renderMatchesSection(
                  activeEventItem.matches,
                  activeEventItem.participants,
                  activeEventItem.event.status === "published" && canManageWeeklyPolls,
                ),
              })}
            </>
          )}
        </View>
      </View>
    );
  }

  function renderHistoryItem(item: EventTimelineItem) {
    const isExpanded = expandedEventId === item.event.id;
    const activeRoster = item.participants.filter(
      (participant) => participant.participant.selection_status === "active",
    );

    return (
      <View key={item.event.id} style={styles.eventCard}>
        <Pressable
          onPress={() => setExpandedEventId((current) => (current === item.event.id ? null : item.event.id))}
          style={styles.eventHeader}>
          <View style={styles.flex}>
            <Text style={styles.eventTitle}>{item.event.title}</Text>
            <Text style={styles.panelText}>{formatEventDate(item.event.starts_at)}</Text>
            <Text style={styles.eventMeta}>
              {formatEventState(item.event.status)} | {activeRoster.length}/{item.event.max_players} no quorum |{" "}
              {item.pollResults.length} enquete(s) | {item.matches.length} partida(s)
            </Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{formatEventState(item.event.status)}</Text>
            </View>
            <Text style={styles.expandLabel}>{isExpanded ? "Recolher" : "Abrir"}</Text>
          </View>
        </Pressable>

        {isExpanded ? (
          <View style={styles.eventContent}>
            {renderAccordionSection({
              title: "Quorum",
              subtitle: "Lista consolidada de quem entrou nesse evento.",
              isExpanded: isHistorySectionExpanded(item.event.id, "roster"),
              onToggle: () => toggleHistorySection(item.event.id, "roster"),
              children: renderRosterList(
                activeRoster,
                "Nenhum jogador foi registrado no quorum desse evento.",
              ),
            })}

            {renderAccordionSection({
              title: "Resultados das enquetes",
              subtitle: "Veja os resultados consolidados das votacoes registradas nesse evento.",
              isExpanded: isHistorySectionExpanded(item.event.id, "polls"),
              onToggle: () => toggleHistorySection(item.event.id, "polls"),
              children:
                item.pollResults.length > 0 ? (
                  <View style={styles.sectionStack}>
                    {item.pollResults.map((summary) => (
                      <View key={summary.poll.id} style={styles.innerCard}>
                        <Text style={styles.innerCardTitle}>{summary.poll.title}</Text>
                        <Text style={styles.innerCardMeta}>
                          {summary.poll.template_id ? "Modelo recorrente" : "Enquete avulsa"} |{" "}
                          {summary.totalVotes} voto(s)
                        </Text>
                        {summary.poll.description ? (
                          <Text style={styles.innerCardText}>{summary.poll.description}</Text>
                        ) : null}
                        {summary.entries.length > 0 ? (
                          summary.entries.map((entry) => (
                            <View key={entry.id} style={styles.rowBetween}>
                              <View style={styles.rowWithAvatar}>
                                <PlayerAvatar name={entry.label} photoUrl={entry.photoUrl} size={32} />
                                <View style={styles.flex}>
                                  <Text style={styles.eventPersonName}>{entry.label}</Text>
                                  {entry.description ? (
                                    <Text style={styles.eventPersonMeta}>{entry.description}</Text>
                                  ) : null}
                                </View>
                              </View>
                              <Text style={styles.voteCount}>{entry.votes}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.panelText}>Essa enquete nao recebeu votos.</Text>
                        )}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.panelText}>Nenhuma enquete foi registrada nesse evento.</Text>
                ),
            })}

            {renderAccordionSection({
              title: "Partidas",
              subtitle: "Consulte os confrontos e os placares registrados nesse evento.",
              isExpanded: isHistorySectionExpanded(item.event.id, "matches"),
              onToggle: () => toggleHistorySection(item.event.id, "matches"),
              children: renderMatchesSection(item.matches, item.participants, false),
            })}
          </View>
        ) : null}
      </View>
    );
  }

  function renderCreateEventModal() {
    return (
      <Modal
        animationType="fade"
        visible={isCreateEventModalVisible}
        transparent
        onRequestClose={() => setIsCreateEventModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}>
          <View style={styles.modalKeyboard}>
            <View style={styles.modalCard}>
              <View style={styles.inlineHeader}>
                <Text style={styles.modalTitle}>Criar chamada</Text>
                <Pressable onPress={() => setIsCreateEventModalVisible(false)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancelar</Text>
                </Pressable>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Data do jogo</Text>
                <Text style={styles.panelText}>
                  Confirme ou altere a data no formato AAAA-MM-DD.
                </Text>
                <TextInput
                  value={createEventDateDraft}
                  onChangeText={setCreateEventDateDraft}
                  placeholder="Ex: 2025-06-14"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                />
              </View>

              <Pressable
                onPress={() => void handleCreateWeeklyEvent()}
                disabled={isCreatingEvent}
                style={[styles.primaryButton, isCreatingEvent && styles.buttonDisabled]}>
                {isCreatingEvent ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Criar chamada para jogo</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  function renderEventPollModal() {
    if (!activeEventItem) {
      return null;
    }

    return (
      <Modal animationType="fade" visible={isEventPollModalVisible} transparent onRequestClose={closeEventPollModal}>
        <View
          style={[
            styles.modalBackdrop,
            {
              paddingTop: Math.max(insets.top + 12, 24),
              paddingBottom: Math.max(insets.bottom + 12, 24),
            },
          ]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
            style={styles.modalKeyboard}>
            <View style={styles.modalCard}>
              <View style={styles.inlineHeader}>
                <Text style={styles.modalTitle}>Criar enquete do evento</Text>
                <Pressable onPress={closeEventPollModal} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Fechar</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>Escolha a origem da enquete</Text>
                  <View style={styles.chips}>
                    {availableEventPollTemplates.map((template) => {
                      const isSelected =
                        selectedEventPollSource?.kind === "template" &&
                        selectedEventPollSource.templateId === template.id;

                      return (
                        <Pressable
                          key={template.id}
                          onPress={() => selectEventPollSource({ kind: "template", templateId: template.id })}
                          style={[styles.chip, isSelected && styles.chipSelected]}>
                          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                            {template.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => selectEventPollSource({ kind: "custom" })}
                      style={[
                        styles.chip,
                        selectedEventPollSource?.kind === "custom" && styles.chipSelected,
                      ]}>
                      <Text
                        style={[
                          styles.chipText,
                          selectedEventPollSource?.kind === "custom" && styles.chipTextSelected,
                        ]}>
                        Enquete avulsa
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {selectedEventPollSource ? (
                  <>
                    <View style={styles.formSection}>
                      <Text style={styles.formSectionTitle}>Dados da enquete</Text>
                      <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Titulo</Text>
                        <TextInput
                          value={eventPollTitleDraft}
                          onChangeText={setEventPollTitleDraft}
                          placeholder="Melhor jogador"
                          placeholderTextColor={Colors.textMuted}
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Descricao</Text>
                        <TextInput
                          value={eventPollDescriptionDraft}
                          onChangeText={setEventPollDescriptionDraft}
                          placeholder="Opcional"
                          placeholderTextColor={Colors.textMuted}
                          multiline
                          style={[styles.input, styles.multilineInput]}
                        />
                      </View>
                      <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Modo de votacao</Text>
                        <View style={styles.chips}>
                          <Pressable
                            onPress={() => setEventPollSelectionModeDraft("event_participant")}
                            style={[
                              styles.chip,
                              eventPollSelectionModeDraft === "event_participant" && styles.chipSelected,
                            ]}>
                            <Text
                              style={[
                                styles.chipText,
                                eventPollSelectionModeDraft === "event_participant" && styles.chipTextSelected,
                              ]}>
                              Qualquer jogador
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              setEventPollSelectionModeDraft("predefined_options");
                              setEventPollOptionDrafts((current) =>
                                current.length >= 2
                                  ? current
                                  : [createEventPollOptionDraft(), createEventPollOptionDraft()],
                              );
                            }}
                            style={[
                              styles.chip,
                              eventPollSelectionModeDraft === "predefined_options" && styles.chipSelected,
                            ]}>
                            <Text
                              style={[
                                styles.chipText,
                                eventPollSelectionModeDraft === "predefined_options" && styles.chipTextSelected,
                              ]}>
                              Opcoes fechadas
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>

                    {eventPollSelectionModeDraft === "predefined_options" ? (
                      <View style={styles.formSection}>
                        <View style={styles.inlineHeader}>
                          <View style={styles.inlineHeaderContent}>
                            <Text style={styles.formSectionTitle}>Opcoes da enquete</Text>
                            <Text style={styles.panelText}>
                              Cada opcao pode ou nao ser associada a um jogador do evento.
                            </Text>
                          </View>
                          <Pressable onPress={addEventPollOptionDraft} style={styles.secondaryButton}>
                            <Text style={styles.secondaryButtonText}>Nova opcao</Text>
                          </Pressable>
                        </View>

                        {eventPollOptionDrafts.map((option) => (
                          <View key={option.id} style={styles.optionCard}>
                            <View style={styles.rowBetween}>
                              <Text style={styles.label}>Opcao</Text>
                              <Pressable onPress={() => removeEventPollOptionDraft(option.id)}>
                                <Text style={styles.linkDanger}>Remover</Text>
                              </Pressable>
                            </View>
                            <TextInput
                              value={option.label}
                              onChangeText={(value) => updateEventPollOptionDraft(option.id, "label", value)}
                              placeholder="Gol de bicicleta"
                              placeholderTextColor={Colors.textMuted}
                              style={styles.input}
                            />
                            <TextInput
                              value={option.description}
                              onChangeText={(value) => updateEventPollOptionDraft(option.id, "description", value)}
                              placeholder="Descricao opcional"
                              placeholderTextColor={Colors.textMuted}
                              style={styles.input}
                            />
                            <View style={styles.chips}>
                              <Pressable
                                onPress={() => updateEventPollOptionDraft(option.id, "targetParticipantId", null)}
                                style={[styles.chip, !option.targetParticipantId && styles.chipSelected]}>
                                <Text
                                  style={[
                                    styles.chipText,
                                    !option.targetParticipantId && styles.chipTextSelected,
                                  ]}>
                                  Sem jogador
                                </Text>
                              </Pressable>
                              {activeParticipants.map((participant) => (
                                <Pressable
                                  key={`${option.id}-${participant.participant.id}`}
                                  onPress={() =>
                                    updateEventPollOptionDraft(option.id, "targetParticipantId", participant.participant.id)
                                  }
                                  style={[
                                    styles.chip,
                                    option.targetParticipantId === participant.participant.id && styles.chipSelected,
                                  ]}>
                                  <Text
                                    style={[
                                      styles.chipText,
                                      option.targetParticipantId === participant.participant.id && styles.chipTextSelected,
                                    ]}>
                                    {participant.player.full_name}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <Pressable
                      onPress={() => void handleSubmitEventPoll()}
                      disabled={isSubmittingEventPoll}
                      style={[styles.primaryButton, isSubmittingEventPoll && styles.buttonDisabled]}>
                      {isSubmittingEventPoll ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Salvar enquete</Text>
                      )}
                    </Pressable>
                  </>
                ) : null}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  }

  function renderMatchModal() {
    if (!matchModal || !activeEventItem) {
      return null;
    }

    const currentMatch =
      matchModal.mode === "edit" && matchModal.targetId
        ? activeEventItem.matches.find((item) => item.match.id === matchModal.targetId) ?? null
        : null;
    const sourceTeams = activeEventItem.matches
      .filter((item) => item.match.id !== currentMatch?.match.id)
      .flatMap((item) => [
        item.homeTeam ? { id: item.homeTeam.team.id, label: `${item.match.title} | ${item.homeTeam.team.name}` } : null,
        item.awayTeam ? { id: item.awayTeam.team.id, label: `${item.match.title} | ${item.awayTeam.team.name}` } : null,
      ])
      .filter((item): item is { id: string; label: string } => item !== null);
    const latestPreviousMatch =
      [...activeEventItem.matches]
        .filter((item) => item.match.id !== currentMatch?.match.id)
        .sort((first, second) => second.match.sort_order - first.match.sort_order)[0] ?? null;
    const latestPreviousMatchTeams = latestPreviousMatch
      ? [
          latestPreviousMatch.homeTeam
            ? { id: latestPreviousMatch.homeTeam.team.id, label: latestPreviousMatch.homeTeam.team.name }
            : null,
          latestPreviousMatch.awayTeam
            ? { id: latestPreviousMatch.awayTeam.team.id, label: latestPreviousMatch.awayTeam.team.name }
            : null,
        ].filter((item): item is { id: string; label: string } => item !== null)
      : [];
    const latestPreviousWinner = latestPreviousMatch ? getPreviousMatchWinner(latestPreviousMatch) : null;
    const positionNameById = new Map(modalityPositions.map((position) => [position.id, position.name]));
    const selectedParticipants = activeParticipants.filter((item) =>
      matchSelectedPlayerIds.includes(item.player.id),
    );
    const selectedFormation = getSelectedFormationPositions(modalityPositions, matchFormationCounts);
    const playersPerTeamTarget = selectedFormation.reduce((total, item) => total + item.countPerTeam, 0);
    const requiredSelectedCount = playersPerTeamTarget * 2;
    const selectedCountMatchesFormation =
      playersPerTeamTarget > 0 && selectedParticipants.length === requiredSelectedCount;
    const canBuildBalancedMatch = selectedFormation.length > 0 && selectedCountMatchesFormation;
    const buildBalancedMatchLabel =
      selectedFormation.length > 0
        ? `Montar times equilibrados (${requiredSelectedCount} jog.)`
        : "Defina a formacao para montar os times";
    const unassignedSelectedCount = selectedParticipants.filter(
      (item) =>
        !matchHomePlayerIds.includes(item.player.id) && !matchAwayPlayerIds.includes(item.player.id),
    ).length;
    const homeTeamRating = calculateTeamRating(matchHomePlayerIds, activeParticipants);
    const awayTeamRating = calculateTeamRating(matchAwayPlayerIds, activeParticipants);
    const homeFormation = tacticalFormations.find((f) => f.id === homeFormationId) ?? null;
    const awayFormation = tacticalFormations.find((f) => f.id === awayFormationId) ?? null;
    const maxPlayersForMatch = (overview?.modality.players_per_team ?? 0) * 2;
    const isPlayerLimitReached = maxPlayersForMatch > 0 && matchSelectedPlayerIds.length >= maxPlayersForMatch;

    return (
      <Modal animationType="fade" visible transparent onRequestClose={closeMatchModal}>
        <View
          style={[
            styles.modalBackdrop,
            {
              paddingTop: Math.max(insets.top + 12, 24),
              paddingBottom: Math.max(insets.bottom + 12, 24),
            },
          ]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
            style={styles.modalKeyboard}>
            <View style={styles.modalCard}>
              <View style={styles.inlineHeader}>
                <Text style={styles.modalTitle}>
                  {matchModal.mode === "create" ? "Nova partida" : "Editar partida"}
                </Text>
                <Pressable onPress={closeMatchModal} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Fechar</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Titulo da partida</Text>
                  <TextInput value={matchTitleDraft} onChangeText={setMatchTitleDraft} style={styles.input} />
                </View>
                {matchModal.mode === "edit" && (
                  <View style={styles.row}>
                    <View style={[styles.fieldBlock, styles.flex]}>
                      <Text style={styles.label}>Placar time A</Text>
                      <TextInput value={matchHomeScoreDraft} onChangeText={setMatchHomeScoreDraft} style={styles.input} keyboardType="number-pad" />
                    </View>
                    <View style={[styles.fieldBlock, styles.flex]}>
                      <Text style={styles.label}>Placar time B</Text>
                      <TextInput value={matchAwayScoreDraft} onChangeText={setMatchAwayScoreDraft} style={styles.input} keyboardType="number-pad" />
                    </View>
                  </View>
                )}

                {matchModal.mode === "create" && latestPreviousMatch ? (
                  <View style={styles.formSection}>
                    <View style={styles.formSectionHeader}>
                      <Text style={styles.formSectionTitle}>Repetir da partida anterior</Text>
                      {latestPreviousWinner && (
                        <Text style={styles.formSectionBadge}>{latestPreviousWinner.team.name} venceu</Text>
                      )}
                    </View>
                    <View style={styles.listActions}>
                      {latestPreviousMatch.homeTeam ? (
                        <Pressable
                          onPress={() => copyExistingTeamToMatchDraft("home", latestPreviousMatch.homeTeam!.team.id)}
                          style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>Repetir Time A</Text>
                        </Pressable>
                      ) : null}
                      {latestPreviousMatch.awayTeam ? (
                        <Pressable
                          onPress={() => copyExistingTeamToMatchDraft("away", latestPreviousMatch.awayTeam!.team.id)}
                          style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>Repetir Time B</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}

                <View style={styles.formSection}>
                  <View style={styles.formSectionHeader}>
                    <Text style={styles.formSectionTitle}>Jogadores</Text>
                    {selectedParticipants.length > 0 && (
                      <Text style={styles.formSectionBadge}>
                        {selectedParticipants.length} sel. · A: {matchHomePlayerIds.length} ({homeTeamRating.toFixed(1)}) · B: {matchAwayPlayerIds.length} ({awayTeamRating.toFixed(1)})
                      </Text>
                    )}
                  </View>

                  <View style={styles.listActions}>
                    <Pressable
                      onPress={() => {
                        const allPlayerIds = activeParticipants.map((item) => item.player.id);
                        setMatchSelectedPlayerIds(allPlayerIds);
                      }}
                      style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Quorum inteiro</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => {
                          setMatchSelectedPlayerIds([]);
                          setMatchHomePlayerIds([]);
                          setMatchAwayPlayerIds([]);
                          setMatchAssignedPositionIds({});
                          setHomeSlotAssignments([]);
                          setAwaySlotAssignments([]);
                          setPendingSlot(null);
                        }}
                        style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Limpar</Text>
                      </Pressable>
                    <Pressable
                      onPress={handleAutoGenerateMatch}
                      disabled={!canBuildBalancedMatch}
                      style={[styles.secondaryButton, !canBuildBalancedMatch && styles.buttonDisabled]}>
                      <Text style={styles.secondaryButtonText}>{buildBalancedMatchLabel}</Text>
                    </Pressable>
                  </View>

                  {unassignedSelectedCount > 0 && (
                    <Text style={styles.fieldHint}>{unassignedSelectedCount} selecionado(s) sem time.</Text>
                  )}

                  {isPlayerLimitReached && (
                    <Text style={styles.fieldHint}>
                      {`Limite de ${maxPlayersForMatch} jogadores atingido (${overview?.modality.players_per_team ?? 0} por time).`}
                    </Text>
                  )}
                  <View style={styles.selectionList}>
                    {activeParticipants.map((item) => {
                      const isSelected = matchSelectedPlayerIds.includes(item.player.id);
                      const isDisabledByLimit = !isSelected && isPlayerLimitReached;
                      const assignedPositionId = matchAssignedPositionIds[item.player.id];
                      const assignedPositionLabel = assignedPositionId
                        ? positionNameById.get(assignedPositionId) ?? null
                        : null;
                      const teamLabel = matchHomePlayerIds.includes(item.player.id)
                        ? matchHomeTeamNameDraft.trim() || "Time A"
                        : matchAwayPlayerIds.includes(item.player.id)
                          ? matchAwayTeamNameDraft.trim() || "Time B"
                          : null;

                      return (
                        <Pressable
                          key={`selected-player-${item.player.id}`}
                          onPress={() => toggleMatchSelectedPlayer(item.player.id)}
                          style={[styles.playerPickerCard, isSelected && styles.playerPickerCardSelected, isDisabledByLimit && styles.playerPickerCardDisabled]}>
                          <View style={styles.rowWithAvatar}>
                            <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} size={36} />
                            <View style={styles.flex}>
                              <Text style={styles.playerPickerTitle}>{item.player.full_name}</Text>
                              <Text style={styles.playerPickerMeta}>
                                {formatPlayerRating(item.player.rating)}
                                {teamLabel ? ` · ${teamLabel}` : ""}
                                {assignedPositionLabel ? ` · ${assignedPositionLabel}` : ""}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.formSection}>
                  <View style={styles.formSectionHeader}>
                    <Text style={styles.formSectionTitle}>Time A</Text>
                    {matchHomePlayerIds.length > 0 && (
                      <Text style={styles.formSectionBadge}>{matchHomePlayerIds.length} jog. · {homeTeamRating.toFixed(1)}</Text>
                    )}
                  </View>
                  <TextInput value={matchHomeTeamNameDraft} onChangeText={setMatchHomeTeamNameDraft} style={styles.input} />

                  {tacticalFormations.length > 0 && (
                    <>
                      <Text style={styles.label}>Formacao tatica</Text>
                      <View style={styles.chips}>
                        {tacticalFormations.map((formation) => (
                          <Pressable
                            key={`home-formation-${formation.id}`}
                            onPress={() => {
                              const oldFormation = tacticalFormations.find((f) => f.id === homeFormationId) ?? null;
                              const newFormation = formation;
                              setHomeFormationId(formation.id);
                              setHomeSlotAssignments((prev) =>
                                remapSlotAssignments(prev, oldFormation, newFormation),
                              );
                            }}
                            style={[styles.chip, homeFormationId === formation.id && styles.chipSelected]}>
                            <Text style={[styles.chipText, homeFormationId === formation.id && styles.chipTextSelected]}>
                              {formation.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}

                  {selectedParticipants.length > 0 ? (
                    <View style={styles.chips}>
                      {selectedParticipants.map((item) => {
                        const isInTeam = matchHomePlayerIds.includes(item.player.id);
                        const slotPendingForHome = pendingSlot?.team === "home";
                        const homeAssignment = homeSlotAssignments.find((a) => a.playerId === item.player.id);
                        const assignedPositionId = matchAssignedPositionIds[item.player.id];
                        const assignedLabel =
                          (homeAssignment
                            ? homeFormation?.slots.find((s) => s.id === homeAssignment.slotId)?.slot_label ?? null
                            : null) ??
                          (assignedPositionId ? positionNameById.get(assignedPositionId) ?? null : null);
                        return (
                          <Pressable
                            key={`home-${item.player.id}`}
                            onPress={() => {
                              if (slotPendingForHome) {
                                // Qualquer jogador selecionado pode ser atribuído — entra no time automaticamente
                                assignPlayerToPendingSlot(item.player.id, item.player.full_name, "home");
                              }
                              // sem slot pendente: nada acontece
                            }}
                            style={[
                              styles.chip,
                              isInTeam && styles.chipSelected,
                              slotPendingForHome && styles.chipPending,
                            ]}>
                            <Text style={[styles.chipText, isInTeam && styles.chipTextSelected]}>
                              {item.player.full_name.split(" ")[0]}
                              {assignedLabel ? ` · ${assignedLabel}` : ""}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.panelText}>Selecione antes os jogadores que vao entrar nessa partida.</Text>
                  )}

                  {homeFormation && (
                    <TacticalField
                      formation={homeFormation}
                      assignments={homeSlotAssignments}
                      selectedSlotId={pendingSlot?.team === "home" ? pendingSlot.slotId : null}
                      onSlotPress={(slot) => handleTacticalSlotPress(slot, "home")}
                    />
                  )}
                </View>

                <View style={styles.formSection}>
                  <View style={styles.formSectionHeader}>
                    <Text style={styles.formSectionTitle}>Time B</Text>
                    {matchAwayPlayerIds.length > 0 && (
                      <Text style={styles.formSectionBadge}>{matchAwayPlayerIds.length} jog. · {awayTeamRating.toFixed(1)}</Text>
                    )}
                  </View>
                  <TextInput value={matchAwayTeamNameDraft} onChangeText={setMatchAwayTeamNameDraft} style={styles.input} />

                  {tacticalFormations.length > 0 && (
                    <>
                      <Text style={styles.label}>Formacao tatica</Text>
                      <View style={styles.chips}>
                        {tacticalFormations.map((formation) => (
                          <Pressable
                            key={`away-formation-${formation.id}`}
                            onPress={() => {
                              const oldFormation = tacticalFormations.find((f) => f.id === awayFormationId) ?? null;
                              const newFormation = formation;
                              setAwayFormationId(formation.id);
                              setAwaySlotAssignments((prev) =>
                                remapSlotAssignments(prev, oldFormation, newFormation),
                              );
                            }}
                            style={[styles.chip, awayFormationId === formation.id && styles.chipSelected]}>
                            <Text style={[styles.chipText, awayFormationId === formation.id && styles.chipTextSelected]}>
                              {formation.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}

                  {selectedParticipants.length > 0 ? (
                    <View style={styles.chips}>
                      {selectedParticipants.map((item) => {
                        const isInTeam = matchAwayPlayerIds.includes(item.player.id);
                        const slotPendingForAway = pendingSlot?.team === "away";
                        const awayAssignment = awaySlotAssignments.find((a) => a.playerId === item.player.id);
                        const assignedPositionId = matchAssignedPositionIds[item.player.id];
                        const assignedLabel =
                          (awayAssignment
                            ? awayFormation?.slots.find((s) => s.id === awayAssignment.slotId)?.slot_label ?? null
                            : null) ??
                          (assignedPositionId ? positionNameById.get(assignedPositionId) ?? null : null);
                        return (
                          <Pressable
                            key={`away-${item.player.id}`}
                            onPress={() => {
                              if (slotPendingForAway) {
                                // Qualquer jogador selecionado pode ser atribuído — entra no time automaticamente
                                assignPlayerToPendingSlot(item.player.id, item.player.full_name, "away");
                              }
                              // sem slot pendente: nada acontece
                            }}
                            style={[
                              styles.chip,
                              isInTeam && styles.chipSelected,
                              slotPendingForAway && styles.chipPending,
                            ]}>
                            <Text style={[styles.chipText, isInTeam && styles.chipTextSelected]}>
                              {item.player.full_name.split(" ")[0]}
                              {assignedLabel ? ` · ${assignedLabel}` : ""}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.panelText}>Selecione antes os jogadores que vao entrar nessa partida.</Text>
                  )}

                  {awayFormation && (
                    <TacticalField
                      formation={awayFormation}
                      assignments={awaySlotAssignments}
                      selectedSlotId={pendingSlot?.team === "away" ? pendingSlot.slotId : null}
                      onSlotPress={(slot) => handleTacticalSlotPress(slot, "away")}
                    />
                  )}
                </View>

                <Pressable onPress={() => void handleSaveMatch()} disabled={isSubmittingMatch} style={[styles.primaryButton, isSubmittingMatch && styles.buttonDisabled]}>
                  {isSubmittingMatch ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{matchModal.mode === "create" ? "Criar partida" : "Salvar partida"}</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#f4f6ef" }}>
      {/* Header fixo com navegação, grupo, status e tabs */}
      {renderEventHeader()}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Estados de carregamento / erro */}
        {isWaitingForVisibleAccounts ? (
          <View style={styles.panel}>
            <ActivityIndicator color={Colors.tint} />
            <Text style={styles.panelText}>Carregando contas esportivas...</Text>
          </View>
        ) : null}

        {!selectedAccess && !isWaitingForVisibleAccounts ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Nenhuma conta esportiva visivel</Text>
            <Text style={styles.panelText}>Assim que houver uma conta vinculada, os eventos aparecerao aqui como timeline principal.</Text>
          </View>
        ) : null}

        {isWaitingForSelectedAccountData ? (
          <View style={styles.panel}>
            <ActivityIndicator color={Colors.tint} />
            <Text style={styles.panelText}>Carregando evento atual e historico da conta...</Text>
          </View>
        ) : null}

        {isSelectedAccountDataUnavailable ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Nao foi possivel abrir os eventos desta conta</Text>
            <Text style={styles.panelText}>
              Tente novamente para recarregar a timeline, o quorum e as enquetes do grupo.
            </Text>
            <Pressable onPress={() => void reloadScreenData()} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Banner de feedback */}
        {message ? (
          <View style={[styles.feedbackBanner, message.tone === "error" ? styles.feedbackError : styles.feedbackSuccess, { marginBottom: 12 }]}>
            <Text style={[styles.feedbackText, message.tone === "error" ? styles.feedbackErrorText : styles.feedbackSuccessText]}>{message.text}</Text>
          </View>
        ) : null}

        {/* Conteúdo principal das tabs (inclui painel de criar evento quando não há ativo) */}
        {selectedAccess && overview ? renderTabContent() : null}
      </ScrollView>

      {renderCreateEventModal()}
      {renderEventPollModal()}
      {renderMatchModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f6ef" },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  contentInner: { width: "100%", maxWidth: 980, alignSelf: "center", gap: 16 },
  hero: { backgroundColor: "#173f2b", borderRadius: 24, padding: 16, gap: 6, overflow: "hidden" },
  heroKicker: { color: "#d7ef57", fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.4 },
  heroTitle: { color: "#ffffff", fontSize: 22, lineHeight: 28, fontWeight: "900" },
  heroSubtitle: { color: "#dce7dc", fontSize: 14, lineHeight: 21 },
  accountSwitcher: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  accountChip: { borderRadius: 999, backgroundColor: "#e4ecde", paddingHorizontal: 14, paddingVertical: 8 },
  accountChipSelected: { backgroundColor: Colors.tint },
  accountChipText: { color: Colors.tint, fontWeight: "700" },
  accountChipTextSelected: { color: "#ffffff" },
  summaryPanel: { backgroundColor: "#ffffff", borderRadius: 20, padding: 16, gap: 8, borderWidth: 1, borderColor: "#d8e2d2" },
  summaryHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  summaryKicker: { color: Colors.textMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1 },
  summaryTitle: { color: Colors.text, fontSize: 24, fontWeight: "800" },
  summaryTags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryTag: { borderRadius: 999, backgroundColor: "#edf4e7", paddingHorizontal: 12, paddingVertical: 8 },
  summaryTagText: { color: Colors.tint, fontSize: 13, fontWeight: "800" },
  panel: { backgroundColor: "#ffffff", borderRadius: 22, padding: 16, gap: 10, borderWidth: 1, borderColor: "#d8e2d2" },
  section: { gap: 12 },
  sectionCard: { backgroundColor: "#ffffff", borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: "#d8e2d2" },
  sectionStack: { gap: 10 },
  accordionContent: { gap: 12 },
  panelTitle: { color: Colors.text, fontSize: 20, fontWeight: "800" },
  workspaceTitle: { color: Colors.text, fontSize: 22, fontWeight: "800" },
  panelText: { color: Colors.textMuted, fontSize: 15, lineHeight: 22 },
  feedbackBanner: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1 },
  feedbackSuccess: { backgroundColor: "#edf7ee", borderColor: "#bad8c0" },
  feedbackError: { backgroundColor: "#fff1ef", borderColor: "#efc6bf" },
  feedbackText: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  feedbackSuccessText: { color: "#1f6e3f" },
  feedbackErrorText: { color: "#9d3b2f" },
  inlineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  inlineHeaderContent: { flex: 1, gap: 6 },
  accordionHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 12 },
  accordionHeaderContent: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 180, gap: 6 },
  accordionHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowWithAvatar: { flexDirection: "row", alignItems: "center", gap: 10 },
  listActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  primaryButton: { backgroundColor: Colors.tint, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  secondaryButton: { backgroundColor: "#edf4e7", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
  secondaryButtonText: { color: Colors.tint, fontSize: 15, fontWeight: "800" },
  inlineActionButton: { backgroundColor: "#e8f3ea", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  inlineActionText: { color: Colors.tint, fontWeight: "800" },
  inlineDangerButton: { backgroundColor: "#fbe7e2", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  inlineDangerText: { color: "#a24335", fontWeight: "800" },
  buttonDisabled: { opacity: 0.6 },
  eventOverviewCard: { borderRadius: 18, backgroundColor: "#f8faf5", padding: 14, gap: 12, borderWidth: 1, borderColor: "#dfe7d8" },
  eventCurrentTitle: { color: Colors.text, fontSize: 22, fontWeight: "800" },
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricPill: { minWidth: 96, flexGrow: 1, borderRadius: 16, backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#dfe7d8", gap: 4 },
  metricLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  metricValue: { color: Colors.text, fontSize: 18, fontWeight: "900" },
  currentStateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  currentStateLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  stateRailCompact: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statePill: { borderRadius: 999, backgroundColor: "#edf3e7", paddingHorizontal: 12, paddingVertical: 10 },
  stateStepCompleted: { backgroundColor: "#d9ebdd" },
  stateStepActive: { backgroundColor: "#dff6bf" },
  stateStepLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: "700" },
  stateStepLabelActive: { color: Colors.text },
  weeklyBoard: { gap: 16 },
  weeklyColumn: { gap: 14 },
  listCard: { backgroundColor: "#f8faf5", borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: "#dfe7d8" },
  listCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarImage: { backgroundColor: "#d9e4d2" },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#dbe8d8" },
  avatarFallbackText: { color: Colors.tint, fontSize: 16, fontWeight: "900" },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { backgroundColor: "#edf4e7", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipSelected: { backgroundColor: Colors.tint },
  chipPending: { backgroundColor: "#f5a623", borderWidth: 2, borderColor: "#ffe0a0" },
  chipText: { color: Colors.tint, fontSize: 14, fontWeight: "700" },
  chipTextSelected: { color: "#ffffff" },
  innerCard: { backgroundColor: "#f8faf5", borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: "#dfe7d8" },
  innerCardTitle: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  innerCardMeta: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  innerCardText: { color: Colors.textMuted, fontSize: 15, lineHeight: 22 },
  resultList: { gap: 10 },
  eventPersonName: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  eventPersonMeta: { color: Colors.textMuted, fontSize: 13 },
  voteCount: { color: Colors.tint, fontSize: 18, fontWeight: "900" },
  voteGrid: { gap: 10 },
  voteOption: { borderRadius: 18, borderWidth: 1, borderColor: "#cfdccc", backgroundColor: "#ffffff", padding: 14 },
  voteOptionSelected: { borderColor: Colors.tint, backgroundColor: "#e8f4ea" },
  voteOptionTitle: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  voteOptionTitleSelected: { color: Colors.tint },
  voteOptionDescription: { color: Colors.textMuted, fontSize: 13 },
  voteOptionDescriptionSelected: { color: Colors.tint },
  matchTeams: { gap: 12 },
  selectionCard: { backgroundColor: "#ffffff", borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: "#dfe7d8" },
  selectionCardTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  selectionCardText: { color: Colors.textMuted, fontSize: 14 },
  matchPlayerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventCard: { backgroundColor: "#ffffff", borderRadius: 22, padding: 16, gap: 12, borderWidth: 1, borderColor: "#d8e2d2" },
  eventHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eventTitle: { color: Colors.text, fontSize: 24, fontWeight: "800" },
  eventMeta: { color: Colors.textMuted, fontSize: 14, lineHeight: 22 },
  eventContent: { gap: 16 },
  headerActions: { alignItems: "flex-end", gap: 8 },
  statusBadge: { borderRadius: 999, backgroundColor: "#edf4e7", paddingHorizontal: 12, paddingVertical: 8 },
  statusBadgeText: { color: Colors.tint, fontSize: 13, fontWeight: "800" },
  expandLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(17, 33, 24, 0.45)", justifyContent: "center", padding: 20 },
  modalKeyboard: { width: "100%", maxHeight: "100%", flexShrink: 1, justifyContent: "center" },
  modalCard: { maxHeight: "100%", width: "100%", alignSelf: "center", backgroundColor: "#ffffff", borderRadius: 28, padding: 18, gap: 12, flexShrink: 1, minHeight: 0, overflow: "hidden" },
  modalTitle: { color: Colors.text, fontSize: 24, fontWeight: "800" },
  modalScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  modalContent: { gap: 18, paddingBottom: 12 },
  formSection: { gap: 14 },
  formSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  formSectionTitle: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  formSectionBadge: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", backgroundColor: "#edf4e7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  positionGridLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldBlock: { gap: 8 },
  fieldHint: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  label: { color: Colors.text, fontSize: 14, fontWeight: "700" },
  input: { borderRadius: 18, borderWidth: 1, borderColor: "#d5dfd1", backgroundColor: "#f8faf5", paddingHorizontal: 16, paddingVertical: 14, color: Colors.text, fontSize: 16 },
  multilineInput: { minHeight: 96, textAlignVertical: "top" },
  positionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  positionCountCard: { width: "31%", minWidth: 96, borderRadius: 18, borderWidth: 1, borderColor: "#dfe7d8", backgroundColor: "#f8faf5", padding: 10, gap: 6, alignItems: "center" },
  positionCountTitle: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  positionCountInput: { borderRadius: 14, borderWidth: 1, borderColor: "#d5dfd1", backgroundColor: "#ffffff", paddingHorizontal: 12, paddingVertical: 10, color: Colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  positionCountHint: { color: Colors.textMuted, fontSize: 12 },
  selectionSummary: { color: Colors.tint, fontSize: 13, fontWeight: "800" },
  selectionList: { gap: 10 },
  playerPickerCard: { borderRadius: 18, borderWidth: 1, borderColor: "#dfe7d8", backgroundColor: "#f8faf5", padding: 14 },
  playerPickerCardSelected: { borderColor: Colors.tint, backgroundColor: "#e8f4ea" },
  playerPickerCardDisabled: { opacity: 0.38 },
  playerPickerTitle: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  playerPickerMeta: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  optionCard: { borderRadius: 20, borderWidth: 1, borderColor: "#dfe7d8", backgroundColor: "#f8faf5", padding: 14, gap: 12 },
  linkDanger: { color: "#a24335", fontWeight: "800" },
  row: { flexDirection: "row", gap: 12 },
});

// ─── Estilos do novo layout (header fixo + tabs) ──────────────────────────────

const newStyles = StyleSheet.create({
  // Header fixo
  header: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2eadb",
    paddingTop: 0,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#edf4e7",
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnText: {
    fontSize: 18,
    color: Colors.tint,
    fontWeight: "700",
    lineHeight: 22,
  },
  navCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  navWeekday: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  navDate: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  navTime: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  groupAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  groupAvatarText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  groupInfo: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  groupMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  adminRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  adminBtn: {
    borderRadius: 999,
    backgroundColor: "#edf4e7",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  adminBtnActive: {
    backgroundColor: Colors.tint,
  },
  adminBtnText: {
    color: Colors.tint,
    fontSize: 12,
    fontWeight: "700",
  },
  adminBtnTextActive: {
    color: "#ffffff",
  },
  adminBtnDanger: {
    backgroundColor: "#fee2e2",
  },
  adminBtnDangerText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "700",
  },
  adminBtnDisabled: {
    opacity: 0.5,
  },
  // Account switcher no header
  accountScroll: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  accountChip: {
    borderRadius: 999,
    backgroundColor: "#e4ecde",
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  accountChipActive: {
    backgroundColor: Colors.tint,
  },
  accountChipText: {
    color: Colors.tint,
    fontSize: 13,
    fontWeight: "700",
  },
  accountChipTextActive: {
    color: "#ffffff",
  },
  // Flex utility
  flex: {
    flex: 1,
  },
  // Player card (confirmados view)
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2eadb",
  },
  // Tab bar
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2eadb",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    position: "relative",
  },
  tabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: Colors.tint,
  },
  tabBadge: {
    borderRadius: 999,
    backgroundColor: "#e4ecde",
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabBadgeActive: {
    backgroundColor: Colors.tint,
  },
  tabBadgeText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  tabBadgeTextActive: {
    color: "#ffffff",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "15%",
    right: "15%",
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.tint,
  },
  // Conteúdo das tabs
  tabContent: {
    gap: 14,
  },
  // Quórum card
  quorumCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#d8e2d2",
  },
  quorumCardRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  quorumCount: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: "900",
  },
  quorumMax: {
    color: Colors.textMuted,
    fontSize: 18,
    fontWeight: "700",
  },
  quorumLabel: {
    color: Colors.textMuted,
    fontSize: 14,
    flex: 1,
    textAlign: "right",
  },
  progressTrack: {
    height: 8,
    backgroundColor: "#e4ecde",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  progressBarOk: {
    backgroundColor: Colors.tint,
  },
  progressBarPending: {
    backgroundColor: "#f5a623",
  },
  quorumPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  quorumPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  quorumPillOk: {
    backgroundColor: "#edf4e7",
    borderColor: "#bad8c0",
  },
  quorumPillPending: {
    backgroundColor: "#fff8e6",
    borderColor: "#ffe0a0",
  },
  quorumPillRemoved: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
  },
  quorumPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  quorumPillTextOk: {
    color: "#1f6e3f",
  },
  quorumPillTextPending: {
    color: "#7a5200",
  },
  quorumPillTextRemoved: {
    color: "#6b7280",
  },
  // Colunas de rascunho (lista semanal)
  draftColumns: {
    flexDirection: "row",
    gap: 10,
  },
  draftColumn: {
    flex: 1,
    gap: 8,
  },
  columnTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  columnTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  selectAllLink: {
    paddingVertical: 2,
  },
  selectAllText: {
    color: Colors.tint,
    fontSize: 12,
    fontWeight: "600",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2eadb",
  },
  playerRowSelected: {
    borderColor: Colors.tint,
    backgroundColor: "#f0f7ec",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#c7d5be",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxSelected: {
    borderColor: Colors.tint,
    backgroundColor: Colors.tint,
  },
  checkboxTick: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 16,
  },
  batchAddButton: {
    marginTop: 4,
    backgroundColor: Colors.tint,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  batchAddButtonDisabled: {
    opacity: 0.5,
  },
  batchAddButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  playerName: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  playerMeta: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  inlineDanger: {
    padding: 4,
  },
  inlineDangerText: {
    color: "#b91c1c",
    fontSize: 18,
    lineHeight: 20,
  },
  inlineAction: {
    padding: 4,
  },
  inlineActionText: {
    color: Colors.tint,
    fontSize: 18,
    lineHeight: 20,
  },
  // Seção genérica dentro de tab
  sectionLabel: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#edf4e7",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#bad8c0",
    borderStyle: "dashed",
  },
  addButtonText: {
    color: Colors.tint,
    fontSize: 15,
    fontWeight: "800",
  },
  sectionStack: {
    gap: 10,
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 32,
  },
  emptyStateEmoji: {
    fontSize: 36,
  },
  emptyStateTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyStateText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  // Poll card
  pollCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#d8e2d2",
  },
  pollTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  pollMeta: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  pollEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f4f6ef",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pollEntryLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  pollEntryVotes: {
    color: Colors.tint,
    fontSize: 14,
    fontWeight: "800",
  },
});
