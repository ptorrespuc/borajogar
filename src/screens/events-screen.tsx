import { useEffect, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";

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
  PollSelectionMode,
  PollTemplate,
  SportsAccount,
} from "@/src/types/domain";

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

function balanceMatchTeams(
  selectedPlayerIds: string[],
  participants: WeeklyEventParticipantItem[],
) {
  const participantMap = new Map(
    participants.map((item, index) => [
      item.player.id,
      {
        item,
        order: index,
      },
    ]),
  );

  const candidates = [...new Set(selectedPlayerIds)]
    .map((playerId) => {
      const participant = participantMap.get(playerId);

      if (!participant) {
        return null;
      }

      return {
        id: playerId,
        order: participant.order,
        rating: getBalanceRating(participant.item.player.rating),
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        order: number;
        rating: number;
      } => item !== null,
    )
    .sort((first, second) => {
      if (second.rating !== first.rating) {
        return second.rating - first.rating;
      }

      return first.order - second.order;
    });

  const homeTarget = Math.ceil(candidates.length / 2);
  const awayTarget = Math.floor(candidates.length / 2);
  const homeTeam: typeof candidates = [];
  const awayTeam: typeof candidates = [];
  let homeRating = 0;
  let awayRating = 0;

  for (const candidate of candidates) {
    const shouldUseHome =
      awayTeam.length >= awayTarget
        ? true
        : homeTeam.length >= homeTarget
          ? false
          : homeRating === awayRating
            ? homeTeam.length <= awayTeam.length
            : homeRating < awayRating;

    if (shouldUseHome) {
      homeTeam.push(candidate);
      homeRating += candidate.rating;
      continue;
    }

    awayTeam.push(candidate);
    awayRating += candidate.rating;
  }

  return {
    homePlayerIds: homeTeam.sort((first, second) => first.order - second.order).map((item) => item.id),
    awayPlayerIds: awayTeam.sort((first, second) => first.order - second.order).map((item) => item.id),
    homeRating: Number(homeRating.toFixed(2)),
    awayRating: Number(awayRating.toFixed(2)),
  };
}

export default function EventsScreen() {
  const router = useRouter();
  const { profile, memberships } = useAuth();
  const isSuperAdmin = Boolean(profile?.is_super_admin);
  const [superAdminAccounts, setSuperAdminAccounts] = useState<SportsAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [timeline, setTimeline] = useState<EventTimelineItem[]>([]);
  const [accountPlayers, setAccountPlayers] = useState<AccountPlayerAdminItem[]>([]);
  const [accountPollTemplates, setAccountPollTemplates] = useState<PollTemplate[]>([]);
  const [eventPollBallots, setEventPollBallots] = useState<EventPollBallot[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [weeklyPriorityFilter, setWeeklyPriorityFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [eventActionId, setEventActionId] = useState<string | null>(null);
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
      setAccountPlayers([]);
      setAccountPollTemplates([]);
      setEventPollBallots([]);
      setExpandedEventId(null);
      return;
    }

    setIsLoading(true);

    try {
      const nextOverview = await getAccountOverview(selectedAccess.account.id);
      const [nextTimeline, nextPlayers, nextTemplates] = await Promise.all([
        listAccountEventTimeline(selectedAccess.account.id, nextOverview.account.modality_id),
        canManageWeeklyList
          ? listAccountPlayers(selectedAccess.account.id, nextOverview.account.modality_id)
          : Promise.resolve([] as AccountPlayerAdminItem[]),
        canManageWeeklyPolls
          ? listAccountPollTemplates(selectedAccess.account.id)
          : Promise.resolve([] as PollTemplate[]),
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

  async function reloadScreenData() {
    await loadSelectedAccountData();
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
      setMessage({ tone: "success", text: "Evento encerrado." });
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
        ...(matchItem.homeTeam?.players.map((player) => player.id) ?? []),
        ...(matchItem.awayTeam?.players.map((player) => player.id) ?? []),
      ]),
    ];

    setMatchModal({ mode: "edit", targetId: matchItem.match.id });
    setMatchTitleDraft(matchItem.match.title);
    setMatchHomeTeamNameDraft(matchItem.homeTeam?.team.name ?? "Time A");
    setMatchAwayTeamNameDraft(matchItem.awayTeam?.team.name ?? "Time B");
    setMatchHomeScoreDraft(String(matchItem.homeTeam?.team.score ?? 0));
    setMatchAwayScoreDraft(String(matchItem.awayTeam?.team.score ?? 0));
    setMatchSelectedPlayerIds(selectedPlayerIds);
    setMatchHomePlayerIds(matchItem.homeTeam?.players.map((player) => player.id) ?? []);
    setMatchAwayPlayerIds(matchItem.awayTeam?.players.map((player) => player.id) ?? []);
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
      return;
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

  function copyExistingTeamToMatchDraft(side: "home" | "away", sourceTeamId: string) {
    const sourceTeam = (activeEventItem?.matches ?? [])
      .flatMap((matchItem) => [matchItem.homeTeam, matchItem.awayTeam])
      .find((team) => team?.team.id === sourceTeamId);

    if (!sourceTeam) {
      return;
    }

    const sourceIds = sourceTeam.players.map((player) => player.id);

    if (side === "home") {
      setMatchHomeTeamNameDraft(sourceTeam.team.name);
      setMatchHomePlayerIds(sourceIds);
      setMatchAwayPlayerIds((currentValue) => currentValue.filter((id) => !sourceIds.includes(id)));
      setMatchSelectedPlayerIds((currentValue) => [
        ...new Set([...currentValue.filter((id) => !sourceIds.includes(id)), ...sourceIds]),
      ]);
      return;
    }

    setMatchAwayTeamNameDraft(sourceTeam.team.name);
    setMatchAwayPlayerIds(sourceIds);
    setMatchHomePlayerIds((currentValue) => currentValue.filter((id) => !sourceIds.includes(id)));
    setMatchSelectedPlayerIds((currentValue) => [
      ...new Set([...currentValue.filter((id) => !sourceIds.includes(id)), ...sourceIds]),
    ]);
  }

  function handleBalanceSelectedPlayers() {
    const selectedIds = [...new Set(matchSelectedPlayerIds)];

    if (selectedIds.length < 2) {
      setMessage({
        tone: "error",
        text: "Selecione pelo menos 2 jogadores para balancear os times.",
      });
      return;
    }

    const balancedTeams = balanceMatchTeams(selectedIds, activeParticipants);
    setMatchHomePlayerIds(balancedTeams.homePlayerIds);
    setMatchAwayPlayerIds(balancedTeams.awayPlayerIds);
    setMessage({
      tone: "success",
      text: `Times balanceados pela nota: ${balancedTeams.homeRating.toFixed(2)} x ${balancedTeams.awayRating.toFixed(2)}.`,
    });
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
          homePlayerIds: matchHomePlayerIds,
          awayPlayerIds: matchAwayPlayerIds,
        });
      } else {
        await createEventMatch({
          eventId: activeEventItem.event.id,
          title: matchTitleDraft.trim(),
          createdBy: profile.id,
          homeTeamName: matchHomeTeamNameDraft.trim() || "Time A",
          awayTeamName: matchAwayTeamNameDraft.trim() || "Time B",
          homePlayerIds: matchHomePlayerIds,
          awayPlayerIds: matchAwayPlayerIds,
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
      await reloadScreenData();
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
      <View style={styles.stateRail}>
        {stateLabels.map((stateLabel, index) => {
          const isCompleted = index < activeStateIndex;
          const isActive = index === activeStateIndex;

          return (
            <View
              key={stateLabel}
              style={[
                styles.stateStep,
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
      <View style={styles.sectionCard}>
        <View style={styles.inlineHeader}>
          <View style={styles.inlineHeaderContent}>
            <Text style={styles.workspaceTitle}>Partidas</Text>
            <Text style={styles.panelText}>
              Guarde as partidas do evento, os times montados e o placar final de cada confronto.
            </Text>
          </View>
          {allowManage ? (
            <Pressable onPress={openCreateMatchModal} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Nova partida</Text>
            </Pressable>
          ) : null}
        </View>

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
                        (matchItem.homeTeam?.players ?? []).map((player) => player.id),
                        participants,
                      ).toFixed(2)}
                    </Text>
                    {(matchItem.homeTeam?.players ?? []).length > 0 ? (
                      (matchItem.homeTeam?.players ?? []).map((player) => (
                        <View key={`${matchItem.match.id}-home-${player.id}`} style={styles.matchPlayerRow}>
                          <PlayerAvatar name={player.full_name} photoUrl={player.photo_url} size={30} />
                          <Text style={styles.selectionCardText}>{player.full_name}</Text>
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
                      (matchItem.awayTeam?.players ?? []).map((player) => player.id),
                      participants,
                    ).toFixed(2)}
                  </Text>
                  {(matchItem.awayTeam?.players ?? []).length > 0 ? (
                    (matchItem.awayTeam?.players ?? []).map((player) => (
                      <View key={`${matchItem.match.id}-away-${player.id}`} style={styles.matchPlayerRow}>
                        <PlayerAvatar name={player.full_name} photoUrl={player.photo_url} size={30} />
                        <Text style={styles.selectionCardText}>{player.full_name}</Text>
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
      );
    }

    return (
      <View style={styles.section}>
        <View style={styles.sectionCard}>
          <View style={styles.inlineHeader}>
            <View style={styles.inlineHeaderContent}>
              <Text style={styles.workspaceTitle}>Evento atual</Text>
              <Text style={styles.panelText}>
                O foco principal da conta fica aqui: lista, enquetes e partidas do evento em andamento.
              </Text>
            </View>
            <Pressable onPress={() => router.push("/agenda")} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Configuracao</Text>
            </Pressable>
          </View>

          {renderStateRail(activeEventItem.event.status)}

          <View style={styles.listCard}>
            <Text style={styles.panelTitle}>{activeEventItem.event.title}</Text>
            <Text style={styles.panelText}>Grupo: {selectedAccess.account.name}</Text>
            <Text style={styles.panelText}>
              Modalidade: {overview.modality.name} | {formatEventDate(activeEventItem.event.starts_at)}
            </Text>
            <Text style={styles.panelText}>
              Na lista: {activeParticipants.length} / {activeEventItem.event.max_players}
            </Text>
            <Text style={styles.panelText}>Estado atual: {formatEventState(activeEventItem.event.status)}</Text>
          </View>

          {activeEventItem.event.status === "draft" ? (
            <>
              <View style={styles.inlineHeader}>
                <View style={styles.inlineHeaderContent}>
                  <Text style={styles.workspaceTitle}>Quorum com lista aberta</Text>
                  <Text style={styles.panelText}>
                    Monte a chamada desta semana incluindo ou retirando jogadores sem perder a ordem de prioridade.
                  </Text>
                </View>
                {canManageWeeklyList ? (
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
                ) : null}
              </View>

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
                      <Text style={[styles.chipText, weeklyPriorityFilter === "all" && styles.chipTextSelected]}>
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
            </>
          ) : (
            <>
              <View style={styles.inlineHeader}>
                <View style={styles.inlineHeaderContent}>
                  <Text style={styles.workspaceTitle}>
                    {activeEventItem.event.status === "published" ? "Lista fechada" : "Evento encerrado"}
                  </Text>
                  <Text style={styles.panelText}>
                    {activeEventItem.event.status === "published"
                      ? "A lista foi congelada. Agora voce pode conduzir enquetes, partidas e depois encerrar o evento."
                      : "O evento foi encerrado. Aqui ficam o quorum final, os resultados das enquetes e as partidas registradas."}
                  </Text>
                </View>
                {activeEventItem.event.status === "published" && canManageWeeklyList ? (
                  <Pressable
                    onPress={() => confirmCompleteEvent(activeEventItem.event.id)}
                    disabled={eventActionId === `complete-${activeEventItem.event.id}`}
                    style={[
                      styles.inlineDangerButton,
                      eventActionId === `complete-${activeEventItem.event.id}` && styles.buttonDisabled,
                    ]}>
                    <Text style={styles.inlineDangerText}>
                      {eventActionId === `complete-${activeEventItem.event.id}` ? "Encerrando..." : "Encerrar evento"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.workspaceTitle}>Quorum final</Text>
                <Text style={styles.panelText}>
                  Essa e a lista definitiva do evento, usada como base para enquetes e partidas.
                </Text>
                {renderRosterList(activeParticipants, "Nenhum jogador foi mantido na lista final.")}
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.inlineHeader}>
                  <View style={styles.inlineHeaderContent}>
                    <Text style={styles.workspaceTitle}>Enquetes do evento</Text>
                    <Text style={styles.panelText}>
                      Vote direto nesta tela e acompanhe o resultado parcial ou final de cada enquete.
                    </Text>
                  </View>
                  {activeEventItem.event.status === "published" && canManageWeeklyPolls ? (
                    <Pressable onPress={openCreateEventPollModal} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>
                        {eventPollBallots.length > 0 ? "Nova enquete" : "Criar enquete"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {eventPollBallots.length > 0 ? (
                  eventPollBallots.map((ballot) => renderPollCard(ballot))
                ) : (
                  <Text style={styles.panelText}>
                    {activeEventItem.event.status === "published"
                      ? "Nenhuma enquete criada ainda para esse evento."
                      : "Nenhuma enquete ficou registrada nesse evento."}
                  </Text>
                )}
              </View>

              {renderMatchesSection(
                activeEventItem.matches,
                activeEventItem.participants,
                activeEventItem.event.status === "published" && canManageWeeklyPolls,
              )}
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
            <View style={styles.sectionCard}>
              <Text style={styles.workspaceTitle}>Quorum</Text>
              <Text style={styles.panelText}>Lista consolidada de quem entrou nesse evento.</Text>
              {renderRosterList(activeRoster, "Nenhum jogador foi registrado no quorum desse evento.")}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.workspaceTitle}>Resultados das enquetes</Text>
              {item.pollResults.length > 0 ? (
                item.pollResults.map((summary) => (
                  <View key={summary.poll.id} style={styles.innerCard}>
                    <Text style={styles.innerCardTitle}>{summary.poll.title}</Text>
                    <Text style={styles.innerCardMeta}>
                      {summary.poll.template_id ? "Modelo recorrente" : "Enquete avulsa"} | {summary.totalVotes} voto(s)
                    </Text>
                    {summary.poll.description ? <Text style={styles.innerCardText}>{summary.poll.description}</Text> : null}
                    {summary.entries.length > 0 ? (
                      summary.entries.map((entry) => (
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
                      ))
                    ) : (
                      <Text style={styles.panelText}>Essa enquete nao recebeu votos.</Text>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.panelText}>Nenhuma enquete foi registrada nesse evento.</Text>
              )}
            </View>

            {renderMatchesSection(item.matches, item.participants, false)}
          </View>
        ) : null}
      </View>
    );
  }

  function renderEventPollModal() {
    if (!activeEventItem) {
      return null;
    }

    return (
      <Modal animationType="fade" visible={isEventPollModalVisible} transparent onRequestClose={closeEventPollModal}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}>
            <View style={styles.modalCard}>
              <View style={styles.inlineHeader}>
                <Text style={styles.modalTitle}>Criar enquete do evento</Text>
                <Pressable onPress={closeEventPollModal} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Fechar</Text>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
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
    const selectedParticipants = activeParticipants.filter((item) =>
      matchSelectedPlayerIds.includes(item.player.id),
    );
    const unassignedSelectedCount = selectedParticipants.filter(
      (item) =>
        !matchHomePlayerIds.includes(item.player.id) && !matchAwayPlayerIds.includes(item.player.id),
    ).length;
    const homeTeamRating = calculateTeamRating(matchHomePlayerIds, activeParticipants);
    const awayTeamRating = calculateTeamRating(matchAwayPlayerIds, activeParticipants);

    return (
      <Modal animationType="fade" visible transparent onRequestClose={closeMatchModal}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={styles.modalCard}>
              <View style={styles.inlineHeader}>
                <Text style={styles.modalTitle}>
                  {matchModal.mode === "create" ? "Nova partida" : "Editar partida"}
                </Text>
                <Pressable onPress={closeMatchModal} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Fechar</Text>
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
                <View style={styles.fieldBlock}>
                  <Text style={styles.label}>Titulo da partida</Text>
                  <TextInput value={matchTitleDraft} onChangeText={setMatchTitleDraft} style={styles.input} />
                </View>
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

                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>Jogadores desta partida</Text>
                  <Text style={styles.fieldHint}>
                    Marque quem entrou nesse jogo antes de dividir os times. Jogadores sem nota contam como 5,00 no balanceamento automatico.
                  </Text>

                  <View style={styles.listActions}>
                    <Pressable
                      onPress={() => {
                        const allPlayerIds = activeParticipants.map((item) => item.player.id);
                        setMatchSelectedPlayerIds(allPlayerIds);
                      }}
                      style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Usar quorum inteiro</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setMatchSelectedPlayerIds([]);
                        setMatchHomePlayerIds([]);
                        setMatchAwayPlayerIds([]);
                      }}
                      style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Limpar selecao</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleBalanceSelectedPlayers}
                      disabled={matchSelectedPlayerIds.length < 2}
                      style={[styles.secondaryButton, matchSelectedPlayerIds.length < 2 && styles.buttonDisabled]}>
                      <Text style={styles.secondaryButtonText}>Balancear por nota</Text>
                    </Pressable>
                  </View>

                  <Text style={styles.selectionSummary}>
                    Selecionados: {selectedParticipants.length} | {matchHomeTeamNameDraft.trim() || "Time A"}:{" "}
                    {matchHomePlayerIds.length} ({homeTeamRating.toFixed(2)}) |{" "}
                    {matchAwayTeamNameDraft.trim() || "Time B"}: {matchAwayPlayerIds.length} ({awayTeamRating.toFixed(2)})
                  </Text>
                  <Text style={styles.fieldHint}>
                    {unassignedSelectedCount > 0
                      ? `${unassignedSelectedCount} jogador(es) selecionado(s) ainda sem time.`
                      : "Todos os selecionados ja estao alocados em um time."}
                  </Text>

                  <View style={styles.selectionList}>
                    {activeParticipants.map((item) => {
                      const isSelected = matchSelectedPlayerIds.includes(item.player.id);
                      const teamLabel = matchHomePlayerIds.includes(item.player.id)
                        ? matchHomeTeamNameDraft.trim() || "Time A"
                        : matchAwayPlayerIds.includes(item.player.id)
                          ? matchAwayTeamNameDraft.trim() || "Time B"
                          : "Ainda sem time";

                      return (
                        <Pressable
                          key={`selected-player-${item.player.id}`}
                          onPress={() => toggleMatchSelectedPlayer(item.player.id)}
                          style={[styles.playerPickerCard, isSelected && styles.playerPickerCardSelected]}>
                          <View style={styles.rowWithAvatar}>
                            <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} size={38} />
                            <View style={styles.flex}>
                              <Text style={styles.playerPickerTitle}>{item.player.full_name}</Text>
                              <Text style={styles.playerPickerMeta}>
                                Nota {formatPlayerRating(item.player.rating)} |{" "}
                                {item.priorityGroup
                                  ? `${item.priorityGroup.priority_rank}. ${item.priorityGroup.name}`
                                  : "Sem prioridade"}
                              </Text>
                              <Text style={styles.playerPickerMeta}>{teamLabel}</Text>
                            </View>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>Time A</Text>
                  <Text style={styles.fieldHint}>
                    Monte o time com base apenas nos jogadores selecionados para essa partida.
                  </Text>
                  <TextInput value={matchHomeTeamNameDraft} onChangeText={setMatchHomeTeamNameDraft} style={styles.input} />
                  <Text style={styles.selectionSummary}>
                    {matchHomePlayerIds.length} jogador(es) | Nota total {homeTeamRating.toFixed(2)}
                  </Text>
                  {sourceTeams.length > 0 ? (
                    <View style={styles.chips}>
                      {sourceTeams.map((team) => (
                        <Pressable key={`home-copy-${team.id}`} onPress={() => copyExistingTeamToMatchDraft("home", team.id)} style={styles.chip}>
                          <Text style={styles.chipText}>{team.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {selectedParticipants.length > 0 ? (
                    <View style={styles.chips}>
                      {selectedParticipants.map((item) => {
                      const isSelected = matchHomePlayerIds.includes(item.player.id);
                      return (
                        <Pressable key={`home-${item.player.id}`} onPress={() => toggleMatchPlayer("home", item.player.id)} style={[styles.chip, isSelected && styles.chipSelected]}>
                          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{item.player.full_name}</Text>
                        </Pressable>
                      );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.panelText}>Selecione antes os jogadores que vao entrar nessa partida.</Text>
                  )}
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>Time B</Text>
                  <Text style={styles.fieldHint}>
                    Ajuste o segundo time depois de marcar quem participa e, se quiser, usar o balanceamento automatico.
                  </Text>
                  <TextInput value={matchAwayTeamNameDraft} onChangeText={setMatchAwayTeamNameDraft} style={styles.input} />
                  <Text style={styles.selectionSummary}>
                    {matchAwayPlayerIds.length} jogador(es) | Nota total {awayTeamRating.toFixed(2)}
                  </Text>
                  {sourceTeams.length > 0 ? (
                    <View style={styles.chips}>
                      {sourceTeams.map((team) => (
                        <Pressable key={`away-copy-${team.id}`} onPress={() => copyExistingTeamToMatchDraft("away", team.id)} style={styles.chip}>
                          <Text style={styles.chipText}>{team.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {selectedParticipants.length > 0 ? (
                    <View style={styles.chips}>
                      {selectedParticipants.map((item) => {
                      const isSelected = matchAwayPlayerIds.includes(item.player.id);
                      return (
                        <Pressable key={`away-${item.player.id}`} onPress={() => toggleMatchPlayer("away", item.player.id)} style={[styles.chip, isSelected && styles.chipSelected]}>
                          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{item.player.full_name}</Text>
                        </Pressable>
                      );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.panelText}>Selecione antes os jogadores que vao entrar nessa partida.</Text>
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
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Eventos</Text>
          <Text style={styles.heroTitle}>O BoraJogar gira em torno do evento da semana.</Text>
          <Text style={styles.heroSubtitle}>
            Abra a chamada, monte o quorum, conduza enquetes, registre partidas e consulte o historico do grupo.
          </Text>
        </View>

        {availableAccounts.length > 1 ? (
          <View style={styles.accountSwitcher}>
            {availableAccounts.map((item) => {
              const isSelected = item.account.id === selectedAccess?.account.id;
              return (
                <Pressable key={item.account.id} onPress={() => setSelectedAccountId(item.account.id)} style={[styles.accountChip, isSelected && styles.accountChipSelected]}>
                  <Text style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}>{item.account.name}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!selectedAccess ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Nenhuma conta esportiva visivel</Text>
            <Text style={styles.panelText}>Assim que houver uma conta vinculada, os eventos aparecerao aqui como timeline principal.</Text>
          </View>
        ) : null}

        {selectedAccess && overview ? (
          <>
            <View style={styles.summaryPanel}>
              <View style={styles.summaryHeader}>
                <View style={styles.flex}>
                  <Text style={styles.panelTitle}>{selectedAccess.account.name}</Text>
                  <Text style={styles.panelText}>{selectedAccess.roleLabel}</Text>
                  <Text style={styles.panelText}>Modalidade: {overview.modality.name}</Text>
                  {selectedAccess.priorityGroupName ? <Text style={styles.panelText}>Grupo prioritario: {selectedAccess.priorityGroupName}</Text> : null}
                </View>
                <Pressable onPress={() => router.push("/agenda")} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Configuracao</Text>
                </Pressable>
              </View>
            </View>

            {message ? (
              <View style={[styles.feedbackBanner, message.tone === "error" ? styles.feedbackError : styles.feedbackSuccess]}>
                <Text style={[styles.feedbackText, message.tone === "error" ? styles.feedbackErrorText : styles.feedbackSuccessText]}>{message.text}</Text>
              </View>
            ) : null}

            {isLoading ? (
              <View style={styles.panel}>
                <ActivityIndicator color={Colors.tint} />
                <Text style={styles.panelText}>Carregando eventos da conta...</Text>
              </View>
            ) : (
              <>
                {renderActiveEventWorkspace()}
                <View style={styles.section}>
                  <View style={styles.inlineHeader}>
                    <View style={styles.inlineHeaderContent}>
                      <Text style={styles.workspaceTitle}>Historico de eventos</Text>
                      <Text style={styles.panelText}>Navegue pelos eventos mais recentes do grupo, do mais novo para o mais antigo.</Text>
                    </View>
                  </View>

                  {historyItems.length > 0 ? historyItems.map((item) => renderHistoryItem(item)) : (
                    <View style={styles.panel}>
                      <Text style={styles.panelText}>Ainda nao ha eventos anteriores para consultar.</Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
      {renderEventPollModal()}
      {renderMatchModal()}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f6ef" },
  content: { padding: 24, gap: 20, paddingBottom: 48 },
  hero: { backgroundColor: "#173f2b", borderRadius: 32, padding: 24, gap: 12, overflow: "hidden" },
  heroKicker: { color: "#d7ef57", fontSize: 16, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.6 },
  heroTitle: { color: "#ffffff", fontSize: 36, lineHeight: 40, fontWeight: "900" },
  heroSubtitle: { color: "#dce7dc", fontSize: 18, lineHeight: 28 },
  accountSwitcher: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  accountChip: { borderRadius: 999, backgroundColor: "#e4ecde", paddingHorizontal: 16, paddingVertical: 10 },
  accountChipSelected: { backgroundColor: Colors.tint },
  accountChipText: { color: Colors.tint, fontWeight: "700" },
  accountChipTextSelected: { color: "#ffffff" },
  summaryPanel: { backgroundColor: "#ffffff", borderRadius: 28, padding: 20, borderWidth: 1, borderColor: "#d8e2d2" },
  summaryHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  panel: { backgroundColor: "#ffffff", borderRadius: 28, padding: 20, gap: 12, borderWidth: 1, borderColor: "#d8e2d2" },
  section: { gap: 16 },
  sectionCard: { backgroundColor: "#ffffff", borderRadius: 24, padding: 18, gap: 14, borderWidth: 1, borderColor: "#d8e2d2" },
  panelTitle: { color: Colors.text, fontSize: 24, fontWeight: "800" },
  workspaceTitle: { color: Colors.text, fontSize: 22, fontWeight: "800" },
  panelText: { color: Colors.textMuted, fontSize: 16, lineHeight: 24 },
  feedbackBanner: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1 },
  feedbackSuccess: { backgroundColor: "#edf7ee", borderColor: "#bad8c0" },
  feedbackError: { backgroundColor: "#fff1ef", borderColor: "#efc6bf" },
  feedbackText: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  feedbackSuccessText: { color: "#1f6e3f" },
  feedbackErrorText: { color: "#9d3b2f" },
  inlineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  inlineHeaderContent: { flex: 1, gap: 6 },
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
  stateRail: { gap: 10 },
  stateStep: { borderRadius: 16, backgroundColor: "#edf3e7", paddingHorizontal: 14, paddingVertical: 12 },
  stateStepCompleted: { backgroundColor: "#d9ebdd" },
  stateStepActive: { backgroundColor: "#dff6bf" },
  stateStepLabel: { color: Colors.textMuted, fontWeight: "700" },
  stateStepLabelActive: { color: Colors.text },
  weeklyBoard: { gap: 16 },
  weeklyColumn: { gap: 14 },
  listCard: { backgroundColor: "#f8faf5", borderRadius: 20, padding: 16, gap: 10, borderWidth: 1, borderColor: "#dfe7d8" },
  listCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarImage: { backgroundColor: "#d9e4d2" },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#dbe8d8" },
  avatarFallbackText: { color: Colors.tint, fontSize: 16, fontWeight: "900" },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { backgroundColor: "#edf4e7", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipSelected: { backgroundColor: Colors.tint },
  chipText: { color: Colors.tint, fontSize: 14, fontWeight: "700" },
  chipTextSelected: { color: "#ffffff" },
  innerCard: { backgroundColor: "#f8faf5", borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: "#dfe7d8" },
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
  eventCard: { backgroundColor: "#ffffff", borderRadius: 26, padding: 18, gap: 14, borderWidth: 1, borderColor: "#d8e2d2" },
  eventHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eventTitle: { color: Colors.text, fontSize: 24, fontWeight: "800" },
  eventMeta: { color: Colors.textMuted, fontSize: 14, lineHeight: 22 },
  eventContent: { gap: 16 },
  headerActions: { alignItems: "flex-end", gap: 8 },
  statusBadge: { borderRadius: 999, backgroundColor: "#edf4e7", paddingHorizontal: 12, paddingVertical: 8 },
  statusBadgeText: { color: Colors.tint, fontSize: 13, fontWeight: "800" },
  expandLabel: { color: Colors.textMuted, fontSize: 13, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(17, 33, 24, 0.45)", justifyContent: "center", padding: 20 },
  modalCard: { maxHeight: "90%", backgroundColor: "#ffffff", borderRadius: 28, padding: 18, gap: 12 },
  modalTitle: { color: Colors.text, fontSize: 24, fontWeight: "800" },
  modalContent: { gap: 18, paddingBottom: 12 },
  formSection: { gap: 14 },
  formSectionTitle: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  fieldBlock: { gap: 8 },
  fieldHint: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  label: { color: Colors.text, fontSize: 14, fontWeight: "700" },
  input: { borderRadius: 18, borderWidth: 1, borderColor: "#d5dfd1", backgroundColor: "#f8faf5", paddingHorizontal: 16, paddingVertical: 14, color: Colors.text, fontSize: 16 },
  multilineInput: { minHeight: 96, textAlignVertical: "top" },
  selectionSummary: { color: Colors.tint, fontSize: 13, fontWeight: "800" },
  selectionList: { gap: 10 },
  playerPickerCard: { borderRadius: 18, borderWidth: 1, borderColor: "#dfe7d8", backgroundColor: "#f8faf5", padding: 14 },
  playerPickerCardSelected: { borderColor: Colors.tint, backgroundColor: "#e8f4ea" },
  playerPickerTitle: { color: Colors.text, fontSize: 15, fontWeight: "800" },
  playerPickerMeta: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  optionCard: { borderRadius: 20, borderWidth: 1, borderColor: "#dfe7d8", backgroundColor: "#f8faf5", padding: 14, gap: 12 },
  linkDanger: { color: "#a24335", fontWeight: "800" },
  row: { flexDirection: "row", gap: 12 },
});
