import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Colors from "@/constants/Colors";
import {
  deactivateAccountMembership,
  type AccountMembershipAdminItem,
  createSportModality,
  createSportsAccount,
  deleteSportModality,
  deleteSportsAccount,
  findProfileByEmail,
  listAllAccountMemberships,
  getAccountOverview,
  listModalityPositions,
  listAllSportsAccounts,
  listSportModalities,
  updateSportModality,
  updateSportsAccount,
  upsertAccountMembership,
  updateSportsAccountBasics,
  type AccountOverview,
} from "@/src/lib/accounts";
import { useAuth } from "@/src/providers/auth-provider";
import type { AccountRole, SportModality, SportsAccount } from "@/src/types/domain";

const roleLabels: Record<AccountRole, string> = {
  group_admin: "Admin do grupo",
  group_moderator: "Moderador do grupo",
  player: "Jogador",
};

const weekdayLabels = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
];

const priorityColors = ["#1d7f46", "#5a9b3c", "#88938c", "#4d7c66", "#9aac8f"];

type AccountAccessItem = {
  account: SportsAccount;
  roleLabel: string;
  membershipRole: AccountRole | null;
  priorityGroupName: string | null;
};

type AdminTab = "modalities" | "accounts" | "memberships";

type AdminModalState =
  | null
  | {
      type: "modality" | "account" | "membership";
      mode: "create" | "edit";
      targetId?: string;
    };

function getReadableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar os dados da conta.";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function isValidHourMinute(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parsePriorityGroups(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name, index) => ({
      name,
      colorHex: priorityColors[index] ?? null,
    }));
}

function parsePositions(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function formatSchedule(weekday: number, startsAt: string, endsAt: string) {
  return `${weekdayLabels[weekday] ?? "Dia"} | ${startsAt.slice(0, 5)} as ${endsAt.slice(0, 5)}`;
}

export default function HomeScreen() {
  const { profile, memberships, error, signOut, refresh } = useAuth();
  const isSuperAdmin = Boolean(profile?.is_super_admin);
  const [superAdminAccounts, setSuperAdminAccounts] = useState<SportsAccount[]>([]);
  const [modalities, setModalities] = useState<SportModality[]>([]);
  const [adminMemberships, setAdminMemberships] = useState<AccountMembershipAdminItem[]>([]);
  const [adminTab, setAdminTab] = useState<AdminTab>("accounts");
  const [adminModal, setAdminModal] = useState<AdminModalState>(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [maxPlayersDraft, setMaxPlayersDraft] = useState("");
  const [openHoursDraft, setOpenHoursDraft] = useState("");
  const [closeMinutesDraft, setCloseMinutesDraft] = useState("");

  const [createModalityNameDraft, setCreateModalityNameDraft] = useState("");
  const [createModalitySlugDraft, setCreateModalitySlugDraft] = useState("");
  const [createModalityPlayersDraft, setCreateModalityPlayersDraft] = useState("5");
  const [createModalityPositionsDraft, setCreateModalityPositionsDraft] = useState(
    "Goleiro, Zagueiro, Ala, Meio-campo, Atacante",
  );

  const [createNameDraft, setCreateNameDraft] = useState("");
  const [createSlugDraft, setCreateSlugDraft] = useState("");
  const [createModalityId, setCreateModalityId] = useState<string | null>(null);
  const [createWeekday, setCreateWeekday] = useState("3");
  const [createStartsAt, setCreateStartsAt] = useState("20:30");
  const [createEndsAt, setCreateEndsAt] = useState("22:00");
  const [createMaxPlayers, setCreateMaxPlayers] = useState("20");
  const [createOpenHours, setCreateOpenHours] = useState("48");
  const [createCloseMinutes, setCreateCloseMinutes] = useState("120");
  const [createPriorityGroups, setCreatePriorityGroups] = useState(
    "Prioridade 1, Prioridade 2, Lista geral",
  );
  const [membershipAccountIdDraft, setMembershipAccountIdDraft] = useState<string | null>(null);
  const [membershipEmailDraft, setMembershipEmailDraft] = useState("");
  const [membershipRoleModalDraft, setMembershipRoleModalDraft] = useState<AccountRole>("player");
  const [membershipPriorityGroupModalId, setMembershipPriorityGroupModalId] = useState<string | null>(null);
  const [membershipProfileIdDraft, setMembershipProfileIdDraft] = useState<string | null>(null);
  const [membershipPriorityOptions, setMembershipPriorityOptions] = useState<Array<{
    id: string;
    name: string;
    priority_rank: number;
  }>>([]);

  useEffect(() => {
    if (adminModal?.type === "account" && adminModal.mode === "edit") {
      return;
    }

    setCreateSlugDraft(slugify(createNameDraft));
  }, [adminModal, createNameDraft]);

  useEffect(() => {
    if (adminModal?.type === "modality" && adminModal.mode === "edit") {
      return;
    }

    setCreateModalitySlugDraft(slugify(createModalityNameDraft));
  }, [adminModal, createModalityNameDraft]);

  useEffect(() => {
    let isActive = true;

    async function loadAdminData() {
      if (!profile?.is_super_admin) {
        setSuperAdminAccounts([]);
        setModalities([]);
        setAdminMemberships([]);
        setCreateModalityId(null);
        return;
      }

      setIsAdminLoading(true);

      try {
        const [nextAccounts, nextModalities, nextMemberships] = await Promise.all([
          listAllSportsAccounts(),
          listSportModalities(),
          listAllAccountMemberships(),
        ]);

        if (!isActive) {
          return;
        }

        setSuperAdminAccounts(nextAccounts);
        setModalities(nextModalities);
        setAdminMemberships(nextMemberships);

        if (nextModalities.length === 0) {
          setCreateModalityId(null);
        } else if (!createModalityId || !nextModalities.some((item) => item.id === createModalityId)) {
          setCreateModalityId(nextModalities[0].id);
        }
      } catch (loadError) {
        if (isActive) {
          setMessage({ tone: "error", text: getReadableError(loadError) });
        }
      } finally {
        if (isActive) {
          setIsAdminLoading(false);
        }
      }
    }

    void loadAdminData();

    return () => {
      isActive = false;
    };
  }, [profile?.is_super_admin, createModalityId]);

  const availableAccounts = (() => {
    const accountMap = new Map<string, AccountAccessItem>();

    for (const membership of memberships) {
      accountMap.set(membership.account.id, {
        account: membership.account,
        roleLabel: roleLabels[membership.membership.role],
        membershipRole: membership.membership.role,
        priorityGroupName: membership.priorityGroup?.name ?? null,
      });
    }

    if (profile?.is_super_admin) {
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

    return [...accountMap.values()].sort((a, b) => a.account.name.localeCompare(b.account.name));
  })();
  const modalityNameById = new Map(modalities.map((modality) => [modality.id, modality.name]));

  const selectedAccess = availableAccounts.find((item) => item.account.id === selectedAccountId) ?? null;
  const selectedMembership = memberships.find((item) => item.account.id === selectedAccountId) ?? null;

  useEffect(() => {
    if (availableAccounts.length === 0) {
      setSelectedAccountId(null);
      return;
    }

    if (!availableAccounts.some((item) => item.account.id === selectedAccountId)) {
      setSelectedAccountId(availableAccounts[0].account.id);
    }
  }, [availableAccounts, selectedAccountId]);

  useEffect(() => {
    let isActive = true;

    async function loadOverview() {
      if (!selectedAccess) {
        setOverview(null);
        setOverviewError(null);
        return;
      }

      setIsOverviewLoading(true);
      setOverviewError(null);

      try {
        const nextOverview = await getAccountOverview(selectedAccess.account.id);

        if (!isActive) {
          return;
        }

        setOverview(nextOverview);
      } catch (loadError) {
        if (isActive) {
          setOverview(null);
          setOverviewError(getReadableError(loadError));
        }
      } finally {
        if (isActive) {
          setIsOverviewLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      isActive = false;
    };
  }, [selectedAccess]);

  useEffect(() => {
    if (!overview) {
      setAccountNameDraft("");
      setMaxPlayersDraft("");
      setOpenHoursDraft("");
      setCloseMinutesDraft("");
      return;
    }

    setAccountNameDraft(overview.account.name);
    setMaxPlayersDraft(String(overview.account.max_players_per_event));
    setOpenHoursDraft(String(overview.account.confirmation_open_hours_before));
    setCloseMinutesDraft(String(overview.account.confirmation_close_minutes_before));
  }, [overview]);

  useEffect(() => {
    if (adminModal?.type !== "membership" || adminModal.mode !== "create") {
      return;
    }

    if (!membershipAccountIdDraft) {
      setMembershipPriorityOptions([]);
      setMembershipPriorityGroupModalId(null);
      return;
    }

    const accountId = membershipAccountIdDraft;
    let isActive = true;

    async function syncPriorityGroups() {
      try {
        const accountOverview = await getAccountOverview(accountId);

        if (!isActive) {
          return;
        }

        const priorityOptions = accountOverview.priorityGroups.map((group) => ({
          id: group.id,
          name: group.name,
          priority_rank: group.priority_rank,
        }));

        setMembershipPriorityOptions(priorityOptions);
        setMembershipPriorityGroupModalId(priorityOptions[0]?.id ?? null);
      } catch (loadError) {
        if (isActive) {
          setMessage({ tone: "error", text: getReadableError(loadError) });
        }
      }
    }

    void syncPriorityGroups();

    return () => {
      isActive = false;
    };
  }, [adminModal, membershipAccountIdDraft]);

  useEffect(() => {
    if (membershipRoleModalDraft !== "player") {
      setMembershipPriorityGroupModalId(null);
      return;
    }

    if (membershipPriorityOptions.length === 0) {
      setMembershipPriorityGroupModalId(null);
      return;
    }

    setMembershipPriorityGroupModalId((currentValue) =>
      currentValue && membershipPriorityOptions.some((group) => group.id === currentValue)
        ? currentValue
        : membershipPriorityOptions[0].id,
    );
  }, [membershipRoleModalDraft, membershipPriorityOptions]);

  async function reloadAccounts() {
    if (!profile?.is_super_admin) {
      return;
    }

    setSuperAdminAccounts(await listAllSportsAccounts());
  }

  async function reloadModalities() {
    if (!profile?.is_super_admin) {
      return;
    }

    const nextModalities = await listSportModalities();
    setModalities(nextModalities);

    if (nextModalities.length === 0) {
      setCreateModalityId(null);
      return;
    }

    setCreateModalityId((currentValue) =>
      currentValue && nextModalities.some((item) => item.id === currentValue)
        ? currentValue
        : nextModalities[0].id,
    );
  }

  async function reloadMemberships() {
    if (!profile?.is_super_admin) {
      return;
    }

    setAdminMemberships(await listAllAccountMemberships());
  }

  function resetModalityForm() {
    setCreateModalityNameDraft("");
    setCreateModalitySlugDraft("");
    setCreateModalityPlayersDraft("5");
    setCreateModalityPositionsDraft("Goleiro, Zagueiro, Ala, Meio-campo, Atacante");
  }

  function resetAccountForm() {
    setCreateNameDraft("");
    setCreateSlugDraft("");
    setCreateModalityId(modalities[0]?.id ?? null);
    setCreateWeekday("3");
    setCreateStartsAt("20:30");
    setCreateEndsAt("22:00");
    setCreateMaxPlayers("20");
    setCreateOpenHours("48");
    setCreateCloseMinutes("120");
    setCreatePriorityGroups("Prioridade 1, Prioridade 2, Lista geral");
  }

  async function hydrateMembershipPriorityOptions(
    accountId: string | null,
    preferredPriorityGroupId?: string | null,
  ) {
    if (!accountId) {
      setMembershipPriorityOptions([]);
      setMembershipPriorityGroupModalId(null);
      return;
    }

    const accountOverview = await getAccountOverview(accountId);
    const priorityOptions = accountOverview.priorityGroups.map((group) => ({
      id: group.id,
      name: group.name,
      priority_rank: group.priority_rank,
    }));

    setMembershipPriorityOptions(priorityOptions);

    if (priorityOptions.length === 0) {
      setMembershipPriorityGroupModalId(null);
      return;
    }

    const nextPriorityGroupId =
      preferredPriorityGroupId && priorityOptions.some((group) => group.id === preferredPriorityGroupId)
        ? preferredPriorityGroupId
        : priorityOptions[0].id;

    setMembershipPriorityGroupModalId(nextPriorityGroupId);
  }

  function resetMembershipForm() {
    const firstAccountId = superAdminAccounts[0]?.id ?? null;
    setMembershipAccountIdDraft(firstAccountId);
    setMembershipEmailDraft("");
    setMembershipRoleModalDraft("player");
    setMembershipProfileIdDraft(null);
    setMembershipPriorityOptions([]);
    setMembershipPriorityGroupModalId(null);
  }

  function closeAdminModal() {
    setAdminModal(null);
    setIsModalLoading(false);
  }

  function openCreateModalityModal() {
    resetModalityForm();
    setAdminModal({
      type: "modality",
      mode: "create",
    });
  }

  async function openEditModalityModal(modality: SportModality) {
    setAdminModal({
      type: "modality",
      mode: "edit",
      targetId: modality.id,
    });
    setIsModalLoading(true);

    try {
      const positions = await listModalityPositions(modality.id);
      setCreateModalityNameDraft(modality.name);
      setCreateModalitySlugDraft(modality.slug);
      setCreateModalityPlayersDraft(String(modality.players_per_team));
      setCreateModalityPositionsDraft(positions.map((position) => position.name).join(", "));
    } catch (loadError) {
      setMessage({ tone: "error", text: getReadableError(loadError) });
      setAdminModal(null);
    } finally {
      setIsModalLoading(false);
    }
  }

  function openCreateAccountModal() {
    resetAccountForm();
    setAdminModal({
      type: "account",
      mode: "create",
    });
  }

  async function openCreateMembershipModal() {
    resetMembershipForm();
    setAdminModal({
      type: "membership",
      mode: "create",
    });
    setIsModalLoading(true);

    try {
      await hydrateMembershipPriorityOptions(superAdminAccounts[0]?.id ?? null);
    } catch (loadError) {
      setMessage({ tone: "error", text: getReadableError(loadError) });
      setAdminModal(null);
    } finally {
      setIsModalLoading(false);
    }
  }

  async function openEditAccountModal(accountId: string) {
    setAdminModal({
      type: "account",
      mode: "edit",
      targetId: accountId,
    });
    setIsModalLoading(true);

    try {
      const accountOverview =
        overview?.account.id === accountId ? overview : await getAccountOverview(accountId);

      setCreateNameDraft(accountOverview.account.name);
      setCreateSlugDraft(accountOverview.account.slug);
      setCreateModalityId(accountOverview.account.modality_id);
      setCreateWeekday(String(accountOverview.schedules[0]?.weekday ?? 3));
      setCreateStartsAt(accountOverview.schedules[0]?.starts_at.slice(0, 5) ?? "20:30");
      setCreateEndsAt(accountOverview.schedules[0]?.ends_at.slice(0, 5) ?? "22:00");
      setCreateMaxPlayers(String(accountOverview.account.max_players_per_event));
      setCreateOpenHours(String(accountOverview.account.confirmation_open_hours_before));
      setCreateCloseMinutes(String(accountOverview.account.confirmation_close_minutes_before));
      setCreatePriorityGroups(accountOverview.priorityGroups.map((group) => group.name).join(", "));
    } catch (loadError) {
      setMessage({ tone: "error", text: getReadableError(loadError) });
      setAdminModal(null);
    } finally {
      setIsModalLoading(false);
    }
  }

  async function openEditMembershipModal(item: AccountMembershipAdminItem) {
    setAdminModal({
      type: "membership",
      mode: "edit",
      targetId: item.membership.id,
    });
    setIsModalLoading(true);

    try {
      setMembershipAccountIdDraft(item.account.id);
      setMembershipEmailDraft(item.profile.email);
      setMembershipRoleModalDraft(item.membership.role);
      setMembershipProfileIdDraft(item.profile.id);
      await hydrateMembershipPriorityOptions(item.account.id, item.priorityGroup?.id ?? null);
    } catch (loadError) {
      setMessage({ tone: "error", text: getReadableError(loadError) });
      setAdminModal(null);
    } finally {
      setIsModalLoading(false);
    }
  }

  async function handleSaveAccount() {
    if (!overview) {
      return;
    }

    const maxPlayersPerEvent = Number(maxPlayersDraft);
    const confirmationOpenHoursBefore = Number(openHoursDraft);
    const confirmationCloseMinutesBefore = Number(closeMinutesDraft);

    if (
      !accountNameDraft.trim() ||
      !Number.isInteger(maxPlayersPerEvent) ||
      maxPlayersPerEvent <= 0 ||
      !Number.isInteger(confirmationOpenHoursBefore) ||
      confirmationOpenHoursBefore < 0 ||
      !Number.isInteger(confirmationCloseMinutesBefore) ||
      confirmationCloseMinutesBefore < 0
    ) {
      setOverviewError("Revise os campos da conta esportiva.");
      return;
    }

    setIsSavingAccount(true);
    setOverviewError(null);

    try {
      await updateSportsAccountBasics({
        accountId: overview.account.id,
        name: accountNameDraft.trim(),
        maxPlayersPerEvent,
        confirmationOpenHoursBefore,
        confirmationCloseMinutesBefore,
      });

      setOverview(await getAccountOverview(overview.account.id));
      await reloadAccounts();
      await refresh();
      setMessage({ tone: "success", text: "Conta esportiva atualizada." });
    } catch (saveError) {
      setOverviewError(getReadableError(saveError));
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function handleCreateAccount() {
    if (!profile) {
      return;
    }

    const slug = createSlugDraft.trim() || slugify(createNameDraft);
    const maxPlayersPerEvent = Number(createMaxPlayers);
    const confirmationOpenHoursBefore = Number(createOpenHours);
    const confirmationCloseMinutesBefore = Number(createCloseMinutes);
    const weekday = Number(createWeekday);
    const priorityGroups = parsePriorityGroups(createPriorityGroups);

    if (
      !createNameDraft.trim() ||
      !slug ||
      !createModalityId ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6 ||
      !isValidHourMinute(createStartsAt) ||
      !isValidHourMinute(createEndsAt) ||
      !Number.isInteger(maxPlayersPerEvent) ||
      maxPlayersPerEvent <= 0 ||
      !Number.isInteger(confirmationOpenHoursBefore) ||
      confirmationOpenHoursBefore < 0 ||
      !Number.isInteger(confirmationCloseMinutesBefore) ||
      confirmationCloseMinutesBefore < 0 ||
      priorityGroups.length === 0
    ) {
      setMessage({ tone: "error", text: "Revise os dados da conta esportiva." });
      return;
    }

    setIsSubmittingModal(true);
    setMessage(null);

    try {
      const isEditing = adminModal?.type === "account" && adminModal.mode === "edit" && adminModal.targetId;
      let resolvedAccountId = adminModal?.targetId ?? null;

      if (isEditing && resolvedAccountId) {
        await updateSportsAccount({
          accountId: resolvedAccountId,
          name: createNameDraft.trim(),
          slug,
          modalityId: createModalityId,
          timezone: "America/Sao_Paulo",
          maxPlayersPerEvent,
          confirmationOpenHoursBefore,
          confirmationCloseMinutesBefore,
          autoNotifyConfirmationOpen: true,
          autoNotifyWaitlistChanges: true,
          autoNotifyEventUpdates: true,
          schedule: {
            weekday,
            startsAt: createStartsAt,
            endsAt: createEndsAt,
          },
          priorityGroups,
        });
      } else {
        const createdAccount = await createSportsAccount({
          createdBy: profile.id,
          name: createNameDraft.trim(),
          slug,
          modalityId: createModalityId,
          timezone: "America/Sao_Paulo",
          maxPlayersPerEvent,
          confirmationOpenHoursBefore,
          confirmationCloseMinutesBefore,
          autoNotifyConfirmationOpen: true,
          autoNotifyWaitlistChanges: true,
          autoNotifyEventUpdates: true,
          schedule: {
            weekday,
            startsAt: createStartsAt,
            endsAt: createEndsAt,
          },
          priorityGroups,
        });

        resolvedAccountId = createdAccount.id;
      }

      await reloadAccounts();
      await refresh();

      if (resolvedAccountId) {
        setSelectedAccountId(resolvedAccountId);
        setOverview(await getAccountOverview(resolvedAccountId));
      }

      closeAdminModal();
      resetAccountForm();
      setAdminTab("accounts");
      setMessage({
        tone: "success",
        text: isEditing ? "Conta esportiva atualizada." : "Conta esportiva criada com sucesso.",
      });
    } catch (createError) {
      setMessage({ tone: "error", text: getReadableError(createError) });
    } finally {
      setIsSubmittingModal(false);
    }
  }

  async function handleCreateModality() {
    if (!profile) {
      return;
    }

    const slug = createModalitySlugDraft.trim() || slugify(createModalityNameDraft);
    const playersPerTeam = Number(createModalityPlayersDraft);
    const positions = parsePositions(createModalityPositionsDraft);

    if (
      !createModalityNameDraft.trim() ||
      !slug ||
      !Number.isInteger(playersPerTeam) ||
      playersPerTeam <= 0 ||
      positions.length === 0
    ) {
      setMessage({ tone: "error", text: "Revise os dados da modalidade esportiva." });
      return;
    }

    setIsSubmittingModal(true);
    setMessage(null);

    try {
      const isEditing = adminModal?.type === "modality" && adminModal.mode === "edit" && adminModal.targetId;
      let createdModalityId: string | null = null;

      if (isEditing && adminModal.targetId) {
        await updateSportModality({
          modalityId: adminModal.targetId,
          name: createModalityNameDraft.trim(),
          slug,
          playersPerTeam,
          positions,
        });
        createdModalityId = adminModal.targetId;
      } else {
        const createdModality = await createSportModality({
          createdBy: profile.id,
          name: createModalityNameDraft.trim(),
          slug,
          playersPerTeam,
          positions,
        });
        createdModalityId = createdModality.id;
      }

      await reloadModalities();
      setCreateModalityId(createdModalityId);
      closeAdminModal();
      resetModalityForm();
      setAdminTab("modalities");

      if (selectedAccess?.account.modality_id === createdModalityId && selectedAccess.account.id) {
        setOverview(await getAccountOverview(selectedAccess.account.id));
      }

      setMessage({
        tone: "success",
        text: isEditing ? "Modalidade esportiva atualizada." : "Modalidade esportiva cadastrada.",
      });
    } catch (createError) {
      setMessage({ tone: "error", text: getReadableError(createError) });
    } finally {
      setIsSubmittingModal(false);
    }
  }

  async function handleDeleteModality(modality: SportModality) {
    setDeletingItemId(modality.id);
    setMessage(null);

    try {
      await deleteSportModality(modality.id);
      await reloadModalities();
      setMessage({ tone: "success", text: "Modalidade esportiva excluida." });
    } catch (deleteError) {
      setMessage({ tone: "error", text: getReadableError(deleteError) });
    } finally {
      setDeletingItemId(null);
    }
  }

  function confirmDeleteModality(modality: SportModality) {
    Alert.alert(
      "Excluir modalidade",
      `Deseja excluir ${modality.name}? A exclusao pode falhar se houver contas esportivas usando essa modalidade.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void handleDeleteModality(modality);
          },
        },
      ],
    );
  }

  async function handleDeleteAccount(account: SportsAccount) {
    setDeletingItemId(account.id);
    setMessage(null);

    try {
      await deleteSportsAccount(account.id);
      await reloadAccounts();
      await refresh();

      if (selectedAccountId === account.id) {
        setSelectedAccountId(null);
        setOverview(null);
      }

      setMessage({ tone: "success", text: "Conta esportiva excluida." });
    } catch (deleteError) {
      setMessage({ tone: "error", text: getReadableError(deleteError) });
    } finally {
      setDeletingItemId(null);
    }
  }

  function confirmDeleteAccount(account: SportsAccount) {
    Alert.alert(
      "Excluir conta esportiva",
      `Deseja excluir ${account.name}? Eventos, grupos prioritarios e vinculos dessa conta serao removidos junto.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => {
            void handleDeleteAccount(account);
          },
        },
      ],
    );
  }

  async function handleSaveMembership() {
    if (!membershipAccountIdDraft) {
      setMessage({ tone: "error", text: "Selecione a conta esportiva do vinculo." });
      return;
    }

    if (membershipRoleModalDraft === "player" && !membershipPriorityGroupModalId) {
      setMessage({ tone: "error", text: "Selecione o grupo prioritario do jogador." });
      return;
    }

    setIsSubmittingModal(true);
    setMessage(null);

    try {
      const isEditing = adminModal?.type === "membership" && adminModal.mode === "edit";
      let profileId = membershipProfileIdDraft;
      let profileLabel = membershipEmailDraft.trim().toLowerCase();

      if (!isEditing) {
        const normalizedEmail = membershipEmailDraft.trim().toLowerCase();

        if (!normalizedEmail || !normalizedEmail.includes("@")) {
          setMessage({ tone: "error", text: "Informe um email valido para o vinculo." });
          return;
        }

        const linkedProfile = await findProfileByEmail(normalizedEmail);

        if (!linkedProfile) {
          setMessage({
            tone: "error",
            text: "Esse email ainda nao tem perfil. O usuario precisa entrar no app uma vez antes do vinculo.",
          });
          return;
        }

        profileId = linkedProfile.id;
        profileLabel = linkedProfile.full_name || linkedProfile.email;
      }

      if (!profileId) {
        setMessage({ tone: "error", text: "Nao foi possivel identificar o usuario do vinculo." });
        return;
      }

      await upsertAccountMembership({
        accountId: membershipAccountIdDraft,
        profileId,
        role: membershipRoleModalDraft,
        priorityGroupId: membershipRoleModalDraft === "player" ? membershipPriorityGroupModalId : null,
      });

      await reloadMemberships();
      await refresh();

      if (selectedAccountId === membershipAccountIdDraft) {
        setOverview(await getAccountOverview(membershipAccountIdDraft));
      }

      closeAdminModal();
      resetMembershipForm();
      setAdminTab("memberships");
      setMessage({
        tone: "success",
        text: isEditing ? "Vinculo atualizado." : `${profileLabel} vinculado com sucesso.`,
      });
    } catch (saveError) {
      setMessage({ tone: "error", text: getReadableError(saveError) });
    } finally {
      setIsSubmittingModal(false);
    }
  }

  async function handleDeactivateMembership(item: AccountMembershipAdminItem) {
    setDeletingItemId(item.membership.id);
    setMessage(null);

    try {
      await deactivateAccountMembership(item.membership.id);
      await reloadMemberships();
      await refresh();

      if (selectedAccountId === item.account.id) {
        setOverview(await getAccountOverview(item.account.id));
      }

      setMessage({ tone: "success", text: "Vinculo removido da conta esportiva." });
    } catch (deactivateError) {
      setMessage({ tone: "error", text: getReadableError(deactivateError) });
    } finally {
      setDeletingItemId(null);
    }
  }

  function confirmDeactivateMembership(item: AccountMembershipAdminItem) {
    Alert.alert(
      "Desvincular usuario",
      `Deseja remover ${item.profile.full_name || item.profile.email} da conta ${item.account.name}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desvincular",
          style: "destructive",
          onPress: () => {
            void handleDeactivateMembership(item);
          },
        },
      ],
    );
  }

  function renderSuperAdminManagement() {
    return (
      <View style={styles.section}>
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setAdminTab("accounts")}
            style={[styles.tabButton, adminTab === "accounts" && styles.tabButtonActive]}>
            <Text style={[styles.tabText, adminTab === "accounts" && styles.tabTextActive]}>
              Contas
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setAdminTab("modalities")}
            style={[styles.tabButton, adminTab === "modalities" && styles.tabButtonActive]}>
            <Text style={[styles.tabText, adminTab === "modalities" && styles.tabTextActive]}>
              Modalidades
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setAdminTab("memberships")}
            style={[styles.tabButton, adminTab === "memberships" && styles.tabButtonActive]}>
            <Text style={[styles.tabText, adminTab === "memberships" && styles.tabTextActive]}>
              Usuarios
            </Text>
          </Pressable>
        </View>

        {adminTab === "accounts" ? (
          <View style={styles.panel}>
            <View style={styles.inlineHeader}>
              <View style={styles.inlineHeaderContent}>
                <Text style={styles.panelTitle}>Cadastro de conta esportiva</Text>
                <Text style={styles.panelText}>
                  Liste, edite, exclua ou crie uma nova conta esportiva.
                </Text>
              </View>
              <Pressable onPress={openCreateAccountModal} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Nova conta</Text>
              </Pressable>
            </View>

            {superAdminAccounts.length > 0 ? (
              superAdminAccounts.map((account) => (
                <View
                  key={account.id}
                  style={[
                    styles.listCard,
                    selectedAccountId === account.id && styles.listCardSelected,
                  ]}>
                  <View style={styles.listCardHeader}>
                    <View style={styles.flex}>
                      <Text style={styles.panelTitle}>{account.name}</Text>
                      <Text style={styles.panelText}>
                        {modalityNameById.get(account.modality_id) ?? "Modalidade sem nome"} | limite{" "}
                        {account.max_players_per_event}
                      </Text>
                    </View>
                    <View style={styles.listActions}>
                      <Pressable
                        onPress={() => setSelectedAccountId(account.id)}
                        style={styles.inlineActionButton}>
                        <Text style={styles.inlineActionText}>Abrir</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void openEditAccountModal(account.id)}
                        style={styles.inlineActionButton}>
                        <Text style={styles.inlineActionText}>Editar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeleteAccount(account)}
                        disabled={deletingItemId === account.id}
                        style={[styles.inlineDangerButton, deletingItemId === account.id && styles.buttonDisabled]}>
                        <Text style={styles.inlineDangerText}>
                          {deletingItemId === account.id ? "Excluindo..." : "Excluir"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.panelText}>Nenhuma conta esportiva cadastrada ainda.</Text>
            )}
          </View>
        ) : adminTab === "modalities" ? (
          <View style={styles.panel}>
            <View style={styles.inlineHeader}>
              <View style={styles.inlineHeaderContent}>
                <Text style={styles.panelTitle}>Cadastro de modalidade esportiva</Text>
                <Text style={styles.panelText}>
                  Mantenha a lista de modalidades e ajuste jogadores por equipe e posicoes.
                </Text>
              </View>
              <Pressable onPress={openCreateModalityModal} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Nova modalidade</Text>
              </Pressable>
            </View>

            {modalities.length > 0 ? (
              modalities.map((modality) => (
                <View key={modality.id} style={styles.listCard}>
                  <View style={styles.listCardHeader}>
                    <View style={styles.flex}>
                      <Text style={styles.panelTitle}>{modality.name}</Text>
                      <Text style={styles.panelText}>
                        slug {modality.slug} | {modality.players_per_team} jogadores por equipe
                      </Text>
                    </View>
                    <View style={styles.listActions}>
                      <Pressable
                        onPress={() => void openEditModalityModal(modality)}
                        style={styles.inlineActionButton}>
                        <Text style={styles.inlineActionText}>Editar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeleteModality(modality)}
                        disabled={deletingItemId === modality.id}
                        style={[styles.inlineDangerButton, deletingItemId === modality.id && styles.buttonDisabled]}>
                        <Text style={styles.inlineDangerText}>
                          {deletingItemId === modality.id ? "Excluindo..." : "Excluir"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.panelText}>Nenhuma modalidade esportiva cadastrada ainda.</Text>
            )}
          </View>
        ) : (
          <View style={styles.panel}>
            <View style={styles.inlineHeader}>
              <View style={styles.inlineHeaderContent}>
                <Text style={styles.panelTitle}>Usuarios e vinculos</Text>
                <Text style={styles.panelText}>
                  Gerencie os usuarios ja cadastrados e seus papeis em cada conta esportiva.
                </Text>
              </View>
              <Pressable onPress={() => void openCreateMembershipModal()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Novo vinculo</Text>
              </Pressable>
            </View>

            {adminMemberships.length > 0 ? (
              adminMemberships.map((item) => (
                <View key={item.membership.id} style={styles.listCard}>
                  <View style={styles.listCardHeader}>
                    <View style={styles.flex}>
                      <Text style={styles.panelTitle}>{item.profile.full_name || item.profile.email}</Text>
                      <Text style={styles.panelText}>{item.profile.email}</Text>
                      <Text style={styles.panelText}>
                        {item.account.name} | {roleLabels[item.membership.role]}
                        {item.priorityGroup ? ` | ${item.priorityGroup.name}` : ""}
                      </Text>
                    </View>
                    <View style={styles.listActions}>
                      <Pressable
                        onPress={() => void openEditMembershipModal(item)}
                        style={styles.inlineActionButton}>
                        <Text style={styles.inlineActionText}>Editar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeactivateMembership(item)}
                        disabled={deletingItemId === item.membership.id}
                        style={[
                          styles.inlineDangerButton,
                          deletingItemId === item.membership.id && styles.buttonDisabled,
                        ]}>
                        <Text style={styles.inlineDangerText}>
                          {deletingItemId === item.membership.id ? "Removendo..." : "Desvincular"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.panelText}>Nenhum usuario vinculado a contas esportivas ainda.</Text>
            )}
          </View>
        )}
      </View>
    );
  }

  function renderAdminModal() {
    if (!adminModal) {
      return null;
    }

    const isModalityModal = adminModal.type === "modality";
    const isMembershipModal = adminModal.type === "membership";
    const title =
      adminModal.mode === "create"
        ? isModalityModal
          ? "Nova modalidade esportiva"
          : isMembershipModal
            ? "Novo vinculo de usuario"
            : "Nova conta esportiva"
        : isModalityModal
          ? "Editar modalidade esportiva"
          : isMembershipModal
            ? "Editar vinculo de usuario"
            : "Editar conta esportiva";

    return (
      <Modal
        animationType="fade"
        visible
        transparent
        onRequestClose={closeAdminModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.inlineHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <Pressable onPress={closeAdminModal} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Fechar</Text>
              </Pressable>
            </View>

            {isModalLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={Colors.tint} />
                <Text style={styles.panelText}>Carregando dados para edicao...</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.modalContent}>
                {isModalityModal ? (
                  <>
                    <TextInput
                      value={createModalityNameDraft}
                      onChangeText={setCreateModalityNameDraft}
                      placeholder="Nome da modalidade"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.input}
                    />
                    <TextInput
                      value={createModalitySlugDraft}
                      onChangeText={(value) => setCreateModalitySlugDraft(slugify(value))}
                      placeholder="futebol-society"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.input}
                      autoCapitalize="none"
                    />
                    <TextInput
                      value={createModalityPlayersDraft}
                      onChangeText={setCreateModalityPlayersDraft}
                      placeholder="Jogadores por equipe"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="number-pad"
                      style={styles.input}
                    />
                    <TextInput
                      value={createModalityPositionsDraft}
                      onChangeText={setCreateModalityPositionsDraft}
                      placeholder="Goleiro, Zagueiro, Ala, Atacante"
                      placeholderTextColor={Colors.textMuted}
                      style={[styles.input, styles.multiline]}
                      multiline
                    />
                    <Pressable
                      onPress={() => void handleCreateModality()}
                      disabled={isSubmittingModal}
                      style={[styles.primaryButton, isSubmittingModal && styles.buttonDisabled]}>
                      {isSubmittingModal ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {adminModal.mode === "create" ? "Criar modalidade" : "Salvar modalidade"}
                        </Text>
                      )}
                    </Pressable>
                  </>
                ) : isMembershipModal ? (
                  <>
                    <Text style={styles.label}>Conta esportiva</Text>
                    <View style={styles.chips}>
                      {superAdminAccounts.map((account) => (
                        <Pressable
                          key={account.id}
                          onPress={() => setMembershipAccountIdDraft(account.id)}
                          disabled={adminModal.mode === "edit"}
                          style={[
                            styles.chip,
                            membershipAccountIdDraft === account.id && styles.chipSelected,
                            adminModal.mode === "edit" && styles.buttonDisabled,
                          ]}>
                          <Text
                            style={[
                              styles.chipText,
                              membershipAccountIdDraft === account.id && styles.chipTextSelected,
                            ]}>
                            {account.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <TextInput
                      value={membershipEmailDraft}
                      onChangeText={setMembershipEmailDraft}
                      placeholder="email@exemplo.com"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      editable={adminModal.mode !== "edit"}
                      keyboardType="email-address"
                      style={[styles.input, adminModal.mode === "edit" && styles.inputReadOnly]}
                    />

                    <Text style={styles.label}>Papel na conta</Text>
                    <View style={styles.chips}>
                      {(Object.entries(roleLabels) as [AccountRole, string][]).map(([role, label]) => (
                        <Pressable
                          key={role}
                          onPress={() => setMembershipRoleModalDraft(role)}
                          style={[
                            styles.chip,
                            membershipRoleModalDraft === role && styles.chipSelected,
                          ]}>
                          <Text
                            style={[
                              styles.chipText,
                              membershipRoleModalDraft === role && styles.chipTextSelected,
                            ]}>
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {membershipRoleModalDraft === "player" ? (
                      <>
                        <Text style={styles.label}>Grupo prioritario</Text>
                        <View style={styles.chips}>
                          {membershipPriorityOptions.map((group) => (
                            <Pressable
                              key={group.id}
                              onPress={() => setMembershipPriorityGroupModalId(group.id)}
                              style={[
                                styles.chip,
                                membershipPriorityGroupModalId === group.id && styles.chipSelected,
                              ]}>
                              <Text
                                style={[
                                  styles.chipText,
                                  membershipPriorityGroupModalId === group.id && styles.chipTextSelected,
                                ]}>
                                {group.priority_rank}. {group.name}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : null}

                    <Pressable
                      onPress={() => void handleSaveMembership()}
                      disabled={isSubmittingModal}
                      style={[styles.primaryButton, isSubmittingModal && styles.buttonDisabled]}>
                      {isSubmittingModal ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {adminModal.mode === "create" ? "Criar vinculo" : "Salvar vinculo"}
                        </Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <TextInput
                      value={createNameDraft}
                      onChangeText={setCreateNameDraft}
                      placeholder="Nome da conta"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.input}
                    />
                    <TextInput
                      value={createSlugDraft}
                      onChangeText={(value) => setCreateSlugDraft(slugify(value))}
                      placeholder="slug-da-conta"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.input}
                      autoCapitalize="none"
                    />

                    <Text style={styles.label}>Modalidade</Text>
                    <View style={styles.chips}>
                      {modalities.map((modality) => (
                        <Pressable
                          key={modality.id}
                          onPress={() => setCreateModalityId(modality.id)}
                          style={[
                            styles.chip,
                            createModalityId === modality.id && styles.chipSelected,
                          ]}>
                          <Text
                            style={[
                              styles.chipText,
                              createModalityId === modality.id && styles.chipTextSelected,
                            ]}>
                            {modality.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.label}>Dia da semana</Text>
                    <View style={styles.chips}>
                      {weekdayLabels.map((weekday, index) => (
                        <Pressable
                          key={weekday}
                          onPress={() => setCreateWeekday(String(index))}
                          style={[
                            styles.chip,
                            createWeekday === String(index) && styles.chipSelected,
                          ]}>
                          <Text
                            style={[
                              styles.chipText,
                              createWeekday === String(index) && styles.chipTextSelected,
                            ]}>
                            {weekday}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.row}>
                      <TextInput
                        value={createStartsAt}
                        onChangeText={setCreateStartsAt}
                        placeholder="20:30"
                        placeholderTextColor={Colors.textMuted}
                        style={[styles.input, styles.flex]}
                      />
                      <TextInput
                        value={createEndsAt}
                        onChangeText={setCreateEndsAt}
                        placeholder="22:00"
                        placeholderTextColor={Colors.textMuted}
                        style={[styles.input, styles.flex]}
                      />
                    </View>

                    <View style={styles.row}>
                      <TextInput
                        value={createMaxPlayers}
                        onChangeText={setCreateMaxPlayers}
                        placeholder="Maximo"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="number-pad"
                        style={[styles.input, styles.flex]}
                      />
                      <TextInput
                        value={createOpenHours}
                        onChangeText={setCreateOpenHours}
                        placeholder="Abre (h)"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="number-pad"
                        style={[styles.input, styles.flex]}
                      />
                      <TextInput
                        value={createCloseMinutes}
                        onChangeText={setCreateCloseMinutes}
                        placeholder="Fecha (min)"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="number-pad"
                        style={[styles.input, styles.flex]}
                      />
                    </View>

                    <TextInput
                      value={createPriorityGroups}
                      onChangeText={setCreatePriorityGroups}
                      placeholder="Prioridade 1, Prioridade 2, Lista geral"
                      placeholderTextColor={Colors.textMuted}
                      style={[styles.input, styles.multiline]}
                      multiline
                    />

                    <Pressable
                      onPress={() => void handleCreateAccount()}
                      disabled={isSubmittingModal}
                      style={[styles.primaryButton, isSubmittingModal && styles.buttonDisabled]}>
                      {isSubmittingModal ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          {adminModal.mode === "create" ? "Criar conta" : "Salvar conta"}
                        </Text>
                      )}
                    </Pressable>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  const canManageAccount = Boolean(
    profile?.is_super_admin || selectedMembership?.membership.role === "group_admin",
  );

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
        <Text style={styles.kicker}>Conta conectada</Text>
        <Text style={styles.heroTitle}>{profile?.full_name || "Usuario autenticado"}</Text>
        <Text style={styles.heroSubtitle}>
          {profile?.is_super_admin
            ? "Perfil global habilitado para criar e administrar contas esportivas."
            : "Perfil autenticado para acessar a conta esportiva vinculada."}
        </Text>
        <View style={styles.heroRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{availableAccounts.length}</Text>
            <Text style={styles.heroStatLabel}>
              {profile?.is_super_admin ? "Contas visiveis" : "Contas vinculadas"}
            </Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{profile?.email ?? "Sem email"}</Text>
            <Text style={styles.heroStatLabel}>Email atual</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {isSuperAdmin ? "Gestao do super admin" : "Vinculos do usuario"}
        </Text>
        <Pressable onPress={() => void signOut()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Sair</Text>
        </Pressable>
      </View>

      {isSuperAdmin ? renderSuperAdminManagement() : availableAccounts.length > 0 ? (
        availableAccounts.map((item) => (
          <Pressable
            key={item.account.id}
            onPress={() => setSelectedAccountId(item.account.id)}
            style={[
              styles.panel,
              selectedAccountId === item.account.id && styles.panelSelected,
            ]}>
            <Text style={styles.panelTitle}>{item.account.name}</Text>
            <Text style={styles.panelText}>{item.roleLabel}</Text>
            <Text style={styles.panelText}>
              Grupo prioritario: {item.priorityGroupName ?? "Nao definido"}
            </Text>
          </Pressable>
        ))
      ) : (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {profile?.is_super_admin
              ? "Nenhuma conta esportiva cadastrada ainda"
              : "Nenhuma conta vinculada ainda"}
          </Text>
          <Text style={styles.panelText}>
            {profile?.is_super_admin
              ? "Use a aba de contas esportivas para cadastrar a primeira conta."
              : "Depois do cadastro da conta, vincule este usuario em account_memberships."}
          </Text>
        </View>
      )}

      {selectedAccess ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{isSuperAdmin ? "Conta selecionada" : "Conta ativa"}</Text>

          {isOverviewLoading && !overview ? (
            <View style={styles.panel}>
              <ActivityIndicator color={Colors.tint} />
              <Text style={styles.panelText}>Carregando configuracao da conta...</Text>
            </View>
          ) : null}

          {overview ? (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{overview.modality.name}</Text>
                  <Text style={styles.summaryLabel}>Modalidade</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{overview.account.max_players_per_event}</Text>
                  <Text style={styles.summaryLabel}>Limite por evento</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{overview.activeMemberCount}</Text>
                  <Text style={styles.summaryLabel}>Membros ativos</Text>
                </View>
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Horario semanal</Text>
                {overview.schedules.map((schedule) => (
                  <Text key={schedule.id} style={styles.panelText}>
                    {formatSchedule(schedule.weekday, schedule.starts_at, schedule.ends_at)}
                  </Text>
                ))}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Grupos prioritarios</Text>
                <View style={styles.chips}>
                  {overview.priorityGroups.map((group) => (
                    <View key={group.id} style={styles.tag}>
                      <Text style={styles.tagText}>
                        {group.priority_rank}. {group.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {!isSuperAdmin && canManageAccount ? (
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Editar conta esportiva</Text>
                  <TextInput
                    value={accountNameDraft}
                    onChangeText={setAccountNameDraft}
                    style={styles.input}
                  />
                  <View style={styles.row}>
                    <TextInput
                      value={maxPlayersDraft}
                      onChangeText={setMaxPlayersDraft}
                      keyboardType="number-pad"
                      style={[styles.input, styles.flex]}
                    />
                    <TextInput
                      value={openHoursDraft}
                      onChangeText={setOpenHoursDraft}
                      keyboardType="number-pad"
                      style={[styles.input, styles.flex]}
                    />
                    <TextInput
                      value={closeMinutesDraft}
                      onChangeText={setCloseMinutesDraft}
                      keyboardType="number-pad"
                      style={[styles.input, styles.flex]}
                    />
                  </View>
                  <Pressable
                    onPress={() => void handleSaveAccount()}
                    disabled={isSavingAccount}
                    style={[styles.primaryButton, isSavingAccount && styles.buttonDisabled]}>
                    {isSavingAccount ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Salvar configuracao</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

        {error || overviewError || message ? (
          <View
            style={[
              styles.messageCard,
              message?.tone === "success" ? styles.messageSuccess : styles.messageError,
            ]}>
            <Text
              style={[
                styles.messageText,
                message?.tone === "success" ? styles.messageTextSuccess : styles.messageTextError,
              ]}>
              {message?.text ?? error ?? overviewError}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      {renderAdminModal()}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 32, gap: 16 },
  hero: {
    borderRadius: 28,
    backgroundColor: Colors.surfaceStrong,
    padding: 24,
    gap: 12,
  },
  kicker: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroTitle: { color: "#f8fbf5", fontSize: 28, fontWeight: "900", lineHeight: 34 },
  heroSubtitle: { color: "#d7e5da", fontSize: 15, lineHeight: 22 },
  heroRow: { flexDirection: "row", gap: 12 },
  heroStat: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 14,
    gap: 4,
  },
  heroStatValue: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  heroStatLabel: { color: "#c6d4c9", fontSize: 12, fontWeight: "700" },
  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  tabRow: {
    flexDirection: "row",
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 12,
  },
  tabButtonActive: {
    backgroundColor: Colors.surface,
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  tabTextActive: {
    color: Colors.text,
  },
  panel: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 10,
  },
  panelSelected: { borderColor: Colors.tint, backgroundColor: "#f3f9ef" },
  panelTitle: { color: Colors.text, fontSize: 16, fontWeight: "800" },
  panelText: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
  inlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  inlineHeaderContent: {
    flex: 1,
    gap: 4,
  },
  listCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 14,
    gap: 10,
  },
  listCardSelected: {
    borderColor: Colors.tint,
    backgroundColor: "#f3f9ef",
  },
  listCardHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  listActions: {
    alignItems: "flex-end",
    gap: 8,
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
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    color: Colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  inputReadOnly: {
    opacity: 0.65,
  },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  label: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: Colors.tint },
  chipText: { color: Colors.tint, fontSize: 12, fontWeight: "800" },
  chipTextSelected: { color: "#ffffff" },
  row: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: Colors.tint,
    paddingVertical: 14,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  secondaryButton: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: { color: Colors.text, fontSize: 12, fontWeight: "800" },
  buttonDisabled: { opacity: 0.7 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  summaryCard: {
    minWidth: "30%",
    flexGrow: 1,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 6,
  },
  summaryValue: { color: Colors.text, fontSize: 20, fontWeight: "900" },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  tag: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagText: { color: Colors.tint, fontSize: 12, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8, 19, 14, 0.48)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    maxHeight: "88%",
    borderRadius: 28,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "900",
  },
  modalContent: {
    gap: 12,
    paddingBottom: 12,
  },
  modalLoading: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 32,
  },
  messageCard: { borderRadius: 16, padding: 14 },
  messageError: { backgroundColor: "#fff2e6" },
  messageSuccess: { backgroundColor: "#e8f6ea" },
  messageText: { fontSize: 13, lineHeight: 20 },
  messageTextError: { color: "#8f4f00" },
  messageTextSuccess: { color: "#1f6b37" },
});
