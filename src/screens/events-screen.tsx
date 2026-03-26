import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import Colors from "@/constants/Colors";
import {
  closeWeeklyEventList,
  completeWeeklyEvent,
  createWeeklyEventCall,
  getAccountOverview,
  listAccountEventTimeline,
  listAllSportsAccounts,
  type AccountOverview,
  type EventPollResultSummary,
  type EventTimelineItem,
} from "@/src/lib/accounts";
import { useAuth } from "@/src/providers/auth-provider";
import type { AccountRole, Event, SportsAccount } from "@/src/types/domain";

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

function getReadableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar os eventos.";
}

function formatEventState(status: Event["status"]) {
  if (status === "draft") {
    return "Lista aberta";
  }

  if (status === "published") {
    return "Evento fechado";
  }

  if (status === "completed") {
    return "Evento encerrado";
  }

  return "Cancelado";
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

function PlayerAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={styles.avatarImage} />;
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackText}>{initials}</Text>
    </View>
  );
}

function PollSummary({ summary }: { summary: EventPollResultSummary }) {
  return (
    <View style={styles.innerCard}>
      <Text style={styles.innerCardTitle}>{summary.poll.title}</Text>
      <Text style={styles.innerCardMeta}>
        {summary.poll.template_id ? "Modelo recorrente" : "Enquete avulsa"} | {summary.totalVotes} voto(s)
      </Text>
      {summary.poll.description ? <Text style={styles.innerCardText}>{summary.poll.description}</Text> : null}
      {summary.entries.length > 0 ? (
        summary.entries.slice(0, 5).map((entry) => (
          <View key={entry.id} style={styles.rowBetween}>
            <View style={styles.rowWithAvatar}>
              <PlayerAvatar name={entry.label} photoUrl={entry.photoUrl} />
              <View style={styles.flex}>
                <Text style={styles.eventPersonName}>{entry.label}</Text>
                {entry.description ? <Text style={styles.eventPersonMeta}>{entry.description}</Text> : null}
              </View>
            </View>
            <Text style={styles.voteCount}>{entry.votes}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.innerCardText}>Sem votos registrados ainda.</Text>
      )}
    </View>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const { profile, memberships } = useAuth();
  const isSuperAdmin = Boolean(profile?.is_super_admin);
  const [superAdminAccounts, setSuperAdminAccounts] = useState<SportsAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [timeline, setTimeline] = useState<EventTimelineItem[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [eventActionId, setEventActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadSuperAdminAccounts() {
      if (!isSuperAdmin) {
        setSuperAdminAccounts([]);
        return;
      }

      try {
        const nextAccounts = await listAllSportsAccounts();

        if (isActive) {
          setSuperAdminAccounts(nextAccounts);
        }
      } catch (loadError) {
        if (isActive) {
          setMessage({ tone: "error", text: getReadableError(loadError) });
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

  useEffect(() => {
    let isActive = true;

    async function loadScreenData() {
      if (!selectedAccess) {
        setOverview(null);
        setTimeline([]);
        setExpandedEventId(null);
        return;
      }

      setIsLoading(true);
      setMessage(null);

      try {
        const nextOverview = await getAccountOverview(selectedAccess.account.id);
        const nextTimeline = await listAccountEventTimeline(
          selectedAccess.account.id,
          nextOverview.account.modality_id,
        );

        if (!isActive) {
          return;
        }

        setOverview(nextOverview);
        setTimeline(nextTimeline);
        setExpandedEventId((current) => current ?? nextTimeline[0]?.event.id ?? null);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setOverview(null);
        setTimeline([]);
        setExpandedEventId(null);
        setMessage({ tone: "error", text: getReadableError(loadError) });
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadScreenData();

    return () => {
      isActive = false;
    };
  }, [selectedAccess]);

  const canManageWeeklyList = Boolean(
    profile?.is_super_admin || selectedMembership?.membership.role === "group_admin",
  );

  async function reloadScreenData() {
    if (!selectedAccess) {
      return;
    }

    const nextOverview = await getAccountOverview(selectedAccess.account.id);
    const nextTimeline = await listAccountEventTimeline(
      selectedAccess.account.id,
      nextOverview.account.modality_id,
    );

    setOverview(nextOverview);
    setTimeline(nextTimeline);
    setExpandedEventId((current) => current ?? nextTimeline[0]?.event.id ?? null);
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

    setIsCreatingEvent(true);
    setMessage(null);

    try {
      await createWeeklyEventCall({
        account: overview.account,
        schedule: nextSchedule,
        priorityGroups: overview.priorityGroups,
        createdBy: profile.id,
      });

      await reloadScreenData();
      setMessage({ tone: "success", text: "Chamada para jogo criada com sucesso." });
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setIsCreatingEvent(false);
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
      setMessage({ tone: "success", text: "Evento encerrado." });
    } catch (actionError) {
      setMessage({ tone: "error", text: getReadableError(actionError) });
    } finally {
      setEventActionId(null);
    }
  }

  const hasOpenEvent = timeline.some(
    (item) => item.event.status === "draft" || item.event.status === "published",
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.heroKicker}>Eventos</Text>
        <Text style={styles.heroTitle}>A vida do grupo gira em torno dos eventos.</Text>
        <Text style={styles.heroSubtitle}>
          Acompanhe a lista, as enquetes e as partidas do mais recente para o mais antigo.
        </Text>
      </View>

      {availableAccounts.length > 1 ? (
        <View style={styles.accountSwitcher}>
          {availableAccounts.map((item) => {
            const isSelected = item.account.id === selectedAccess?.account.id;

            return (
              <Pressable
                key={item.account.id}
                onPress={() => setSelectedAccountId(item.account.id)}
                style={[styles.accountChip, isSelected && styles.accountChipSelected]}>
                <Text style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}>
                  {item.account.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!selectedAccess ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Nenhuma conta esportiva visivel</Text>
          <Text style={styles.panelText}>
            Assim que houver uma conta vinculada, os eventos aparecerao aqui como timeline principal.
          </Text>
        </View>
      ) : null}

      {selectedAccess && overview ? (
        <>
          <View style={styles.summaryPanel}>
            <View style={styles.summaryHeader}>
              <View style={styles.flex}>
                <Text style={styles.panelTitle}>{selectedAccess.account.name}</Text>
                <Text style={styles.panelText}>
                  {selectedAccess.roleLabel} | Modalidade {overview.modality.name}
                </Text>
                {selectedAccess.priorityGroupName ? (
                  <Text style={styles.panelText}>Grupo prioritario: {selectedAccess.priorityGroupName}</Text>
                ) : null}
              </View>
              <Pressable onPress={() => router.push("/agenda")} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Configuracao</Text>
              </Pressable>
            </View>

            {!hasOpenEvent && canManageWeeklyList ? (
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
            ) : null}
          </View>

          {isLoading ? (
            <View style={styles.panel}>
              <ActivityIndicator color={Colors.tint} />
              <Text style={styles.panelText}>Carregando eventos da conta...</Text>
            </View>
          ) : timeline.length === 0 ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Ainda nao existem eventos</Text>
              <Text style={styles.panelText}>
                Quando a primeira chamada for criada, os eventos passarao a aparecer aqui do mais novo para o mais antigo.
              </Text>
            </View>
          ) : (
            <View style={styles.section}>
              {timeline.map((item) => {
                const isExpanded = expandedEventId === item.event.id;
                const activeParticipants = item.participants.filter(
                  (participant) => participant.participant.selection_status === "active",
                );

                return (
                  <View
                    key={item.event.id}
                    style={[
                      styles.eventCard,
                      item.event.status !== "completed" && styles.eventCardActive,
                    ]}>
                    <Pressable
                      onPress={() =>
                        setExpandedEventId((current) =>
                          current === item.event.id ? null : item.event.id,
                        )
                      }
                      style={styles.eventHeader}>
                      <View style={styles.flex}>
                        <Text style={styles.eventTitle}>{item.event.title}</Text>
                        <Text style={styles.panelText}>{formatEventDate(item.event.starts_at)}</Text>
                        <Text style={styles.eventMeta}>
                          {formatEventState(item.event.status)} | {activeParticipants.length}/{item.event.max_players} na lista |{" "}
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
                        {item.event.status === "draft" && canManageWeeklyList ? (
                          <View style={styles.actionRow}>
                            <Pressable onPress={() => router.push("/agenda")} style={styles.inlineActionButton}>
                              <Text style={styles.inlineActionText}>Gerenciar lista</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => confirmCloseList(item.event.id)}
                              disabled={eventActionId === `close-${item.event.id}`}
                              style={[styles.inlineActionButton, eventActionId === `close-${item.event.id}` && styles.buttonDisabled]}>
                              <Text style={styles.inlineActionText}>
                                {eventActionId === `close-${item.event.id}` ? "Fechando..." : "Fechar lista"}
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}

                        {item.event.status === "published" && canManageWeeklyList ? (
                          <View style={styles.actionRow}>
                            <Pressable onPress={() => router.push("/agenda")} style={styles.inlineActionButton}>
                              <Text style={styles.inlineActionText}>Gerenciar evento</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => confirmCompleteEvent(item.event.id)}
                              disabled={eventActionId === `complete-${item.event.id}`}
                              style={[styles.inlineDangerButton, eventActionId === `complete-${item.event.id}` && styles.buttonDisabled]}>
                              <Text style={styles.inlineDangerText}>
                                {eventActionId === `complete-${item.event.id}` ? "Encerrando..." : "Encerrar evento"}
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}

                        <View style={styles.innerSection}>
                          <Text style={styles.innerSectionTitle}>Quorum</Text>
                          {activeParticipants.length > 0 ? (
                            activeParticipants.map((participant) => (
                              <View key={participant.participant.id} style={styles.personRow}>
                                <View style={styles.rowWithAvatar}>
                                  <PlayerAvatar
                                    name={participant.player.full_name}
                                    photoUrl={participant.player.photo_url}
                                  />
                                  <View style={styles.flex}>
                                    <Text style={styles.eventPersonName}>{participant.player.full_name}</Text>
                                    <Text style={styles.eventPersonMeta}>
                                      {participant.priorityGroup
                                        ? `${participant.priorityGroup.priority_rank}. ${participant.priorityGroup.name}`
                                        : "Sem prioridade definida"}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={styles.eventPersonMeta}>
                                  {participant.preferredPositions.length > 0
                                    ? participant.preferredPositions.map((position) => position.name).join(", ")
                                    : "Sem posicoes"}
                                </Text>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.panelText}>Nenhum jogador ativo na lista desse evento.</Text>
                          )}
                        </View>

                        <View style={styles.innerSection}>
                          <Text style={styles.innerSectionTitle}>Enquetes</Text>
                          {item.pollResults.length > 0 ? (
                            item.pollResults.map((summary) => (
                              <PollSummary key={summary.poll.id} summary={summary} />
                            ))
                          ) : (
                            <Text style={styles.panelText}>Nenhuma enquete criada para este evento.</Text>
                          )}
                        </View>

                        <View style={styles.innerSection}>
                          <Text style={styles.innerSectionTitle}>Partidas</Text>
                          {item.matches.length > 0 ? (
                            item.matches.map((match) => (
                              <View key={match.match.id} style={styles.innerCard}>
                                <Text style={styles.innerCardTitle}>{match.match.title}</Text>
                                <Text style={styles.innerCardMeta}>
                                  {match.match.status === "completed" ? "Partida encerrada" : "Partida em andamento"}
                                </Text>
                                <View style={styles.scoreRow}>
                                  <View style={styles.scoreTeam}>
                                    <Text style={styles.scoreTeamName}>{match.homeTeam?.team.name ?? "Time A"}</Text>
                                    <Text style={styles.scoreValue}>{match.homeTeam?.team.score ?? 0}</Text>
                                  </View>
                                  <Text style={styles.scoreDivider}>x</Text>
                                  <View style={styles.scoreTeam}>
                                    <Text style={styles.scoreTeamName}>{match.awayTeam?.team.name ?? "Time B"}</Text>
                                    <Text style={styles.scoreValue}>{match.awayTeam?.team.score ?? 0}</Text>
                                  </View>
                                </View>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.panelText}>Nenhuma partida registrada para este evento.</Text>
                          )}
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : null}

      {message ? (
        <View
          style={[
            styles.messageCard,
            message.tone === "error" ? styles.messageError : styles.messageSuccess,
          ]}>
          <Text
            style={[
              styles.messageText,
              message.tone === "error" ? styles.messageTextError : styles.messageTextSuccess,
            ]}>
            {message.text}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  hero: {
    borderRadius: 28,
    backgroundColor: Colors.surfaceStrong,
    padding: 24,
    gap: 12,
  },
  heroKicker: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    maxWidth: 320,
  },
  heroSubtitle: {
    color: "#d6e3da",
    fontSize: 15,
    lineHeight: 22,
  },
  accountSwitcher: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  accountChip: {
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  accountChipSelected: {
    backgroundColor: "#eff8ec",
    borderColor: Colors.tint,
  },
  accountChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  accountChipTextSelected: {
    color: Colors.tint,
  },
  panel: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 10,
  },
  summaryPanel: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 14,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  panelTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  panelText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  flex: {
    flex: 1,
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: Colors.tint,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  section: {
    gap: 12,
  },
  eventCard: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 14,
  },
  eventCardActive: {
    borderColor: Colors.tint,
    backgroundColor: "#f4f9f1",
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  eventTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  eventMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  headerActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  statusBadge: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusBadgeText: {
    color: Colors.tint,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  expandLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  eventContent: {
    gap: 14,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  inlineActionButton: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineActionText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  inlineDangerButton: {
    borderRadius: 999,
    backgroundColor: "#fde9e6",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineDangerText: {
    color: "#a43a26",
    fontSize: 12,
    fontWeight: "800",
  },
  innerSection: {
    gap: 10,
  },
  innerSectionTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  personRow: {
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 10,
  },
  rowWithAvatar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  eventPersonName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  eventPersonMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  innerCard: {
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  innerCardTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  innerCardMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  innerCardText: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  voteCount: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  scoreTeam: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  scoreTeamName: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  scoreValue: {
    color: Colors.tint,
    fontSize: 26,
    fontWeight: "900",
  },
  scoreDivider: {
    color: Colors.textMuted,
    fontSize: 18,
    fontWeight: "900",
  },
  messageCard: {
    borderRadius: 18,
    padding: 14,
  },
  messageError: {
    backgroundColor: "#fff2e6",
  },
  messageSuccess: {
    backgroundColor: "#e8f6ea",
  },
  messageText: {
    fontSize: 13,
    lineHeight: 20,
  },
  messageTextError: {
    color: "#8f4f00",
  },
  messageTextSuccess: {
    color: "#1f6b37",
  },
});
