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
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Colors from "@/constants/Colors";
import { PlayerPhotoField } from "@/src/components/player-photo-field";
import {
  createAccountPlayer,
  deactivateAccountPlayer,
  ensurePlayerLoginAccess,
  findProfileByEmail,
  getAccountOverview,
  listAccountPlayers,
  listAllSportsAccounts,
  listModalityPositions,
  updateAccountPlayer,
  updateProfileBasics,
  type AccountOverview,
  type AccountPlayerAdminItem,
  type ProvisionedAuthProfile,
} from "@/src/lib/accounts";
import {
  deleteManagedPlayerPhoto,
  isManagedPlayerPhotoUrl,
  pickAndPreparePlayerPhotoFromLibrary,
  takeAndPreparePlayerPhoto,
  uploadPreparedPlayerPhoto,
  type PreparedPlayerPhoto,
} from "@/src/lib/player-photos";
import { useAuth } from "@/src/providers/auth-provider";
import type { AccountRole, DominantSide, ModalityPosition, SportsAccount } from "@/src/types/domain";

const roleLabels: Record<AccountRole, string> = {
  group_admin: "Admin do grupo",
  group_moderator: "Moderador do grupo",
  player: "Jogador",
};

const dominantSideLabels: Record<DominantSide, string> = {
  right: "Destro",
  left: "Canhoto",
};

type AccountAccessItem = {
  account: SportsAccount;
  roleLabel: string;
  membershipRole: AccountRole | null;
  priorityGroupName: string | null;
};

type PlayerModalState =
  | null
  | {
      mode: "self" | "create" | "edit";
      targetId?: string;
    };

function getReadableError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Nao foi possivel carregar o elenco.";
}

function parseOptionalPlayerAge(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error("A idade deve ser um numero inteiro.");
  }

  const age = Number(trimmed);

  if (age < 0 || age > 120) {
    throw new Error("A idade deve ficar entre 0 e 120 anos.");
  }

  return age;
}

function parseOptionalPlayerRating(value: string) {
  const trimmed = value.trim().replace(",", ".");

  if (!trimmed) {
    return null;
  }

  if (!/^\d{1,2}(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("A nota deve ficar entre 0 e 10, com ate 2 casas decimais.");
  }

  const rating = Number(trimmed);

  if (Number.isNaN(rating) || rating < 0 || rating > 10) {
    throw new Error("A nota deve ficar entre 0 e 10, com ate 2 casas decimais.");
  }

  return Number(rating.toFixed(2));
}

function normalizeOptionalNotes(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatPlayerRating(value: number | null) {
  return value === null ? "Sem nota" : value.toFixed(2);
}

function formatDominantSide(value: DominantSide | null) {
  return value ? dominantSideLabels[value] : "Nao informado";
}

function getDominantSideLabel(modalityName: string | null | undefined) {
  const normalizedName = modalityName?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() ?? "";

  return normalizedName.includes("futebol") ? "Pe dominante" : "Mao dominante";
}

function getPlayerInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function PlayerAvatar({
  name,
  photoUrl,
  size = 52,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: Colors.surfaceMuted,
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}>
      <Text style={styles.avatarFallbackText}>{getPlayerInitials(name)}</Text>
    </View>
  );
}

export default function RosterScreen() {
  const { profile, memberships, refresh } = useAuth();
  const isSuperAdmin = Boolean(profile?.is_super_admin);

  const [superAdminAccounts, setSuperAdminAccounts] = useState<SportsAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [accountPlayers, setAccountPlayers] = useState<AccountPlayerAdminItem[]>([]);
  const [modalityPositions, setModalityPositions] = useState<ModalityPosition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [playerModal, setPlayerModal] = useState<PlayerModalState>(null);
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);

  const [playerNameDraft, setPlayerNameDraft] = useState("");
  const [playerEmailDraft, setPlayerEmailDraft] = useState("");
  const [playerPhotoUrlDraft, setPlayerPhotoUrlDraft] = useState("");
  const [playerExistingPhotoUrl, setPlayerExistingPhotoUrl] = useState<string | null>(null);
  const [playerPreparedPhoto, setPlayerPreparedPhoto] = useState<PreparedPlayerPhoto | null>(null);
  const [playerPhotoTouched, setPlayerPhotoTouched] = useState(false);
  const [playerPriorityGroupDraftId, setPlayerPriorityGroupDraftId] = useState<string | null>(null);
  const [playerPreferredPositionIds, setPlayerPreferredPositionIds] = useState<string[]>([]);
  const [playerAgeDraft, setPlayerAgeDraft] = useState("");
  const [playerRatingDraft, setPlayerRatingDraft] = useState("");
  const [playerDominantSideDraft, setPlayerDominantSideDraft] = useState<DominantSide | null>(null);
  const [playerNotesDraft, setPlayerNotesDraft] = useState("");
  const [playerWeeklyDefaultDraft, setPlayerWeeklyDefaultDraft] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadAccountsForSuperAdmin() {
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

    void loadAccountsForSuperAdmin();

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

    return [...accountMap.values()].sort((a, b) => a.account.name.localeCompare(b.account.name));
  }, [isSuperAdmin, memberships, superAdminAccounts]);

  const selectedAccess =
    availableAccounts.find((item) => item.account.id === selectedAccountId) ?? availableAccounts[0] ?? null;
  const selectedMembership =
    memberships.find((item) => item.account.id === selectedAccess?.account.id) ?? null;
  const canManagePlayers = Boolean(
    isSuperAdmin || selectedMembership?.membership.role === "group_admin",
  );

  useEffect(() => {
    if (availableAccounts.length === 0) {
      setSelectedAccountId(null);
      return;
    }

    if (!selectedAccountId || !availableAccounts.some((item) => item.account.id === selectedAccountId)) {
      setSelectedAccountId(availableAccounts[0].account.id);
    }
  }, [availableAccounts, selectedAccountId]);

  useEffect(() => {
    let isActive = true;

    async function loadSelectedAccountData() {
      if (!selectedAccess) {
        setOverview(null);
        setAccountPlayers([]);
        setModalityPositions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const [nextOverview, nextPlayers, nextPositions] = await Promise.all([
          getAccountOverview(selectedAccess.account.id),
          listAccountPlayers(selectedAccess.account.id, selectedAccess.account.modality_id),
          listModalityPositions(selectedAccess.account.modality_id),
        ]);

        if (!isActive) {
          return;
        }

        setOverview(nextOverview);
        setAccountPlayers(nextPlayers);
        setModalityPositions(nextPositions);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setOverview(null);
        setAccountPlayers([]);
        setModalityPositions([]);
        setMessage({ tone: "error", text: getReadableError(loadError) });
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadSelectedAccountData();

    return () => {
      isActive = false;
    };
  }, [selectedAccess]);

  const currentPlayer = useMemo(() => {
    const normalizedEmail = profile?.email?.trim().toLowerCase() ?? null;

    return (
      accountPlayers.find(
        (item) =>
          item.linkedProfile?.id === profile?.id ||
          (normalizedEmail !== null &&
            item.player.email?.trim().toLowerCase() === normalizedEmail),
      ) ?? null
    );
  }, [accountPlayers, profile?.email, profile?.id]);

  function resetPlayerForm() {
    setPlayerNameDraft("");
    setPlayerEmailDraft("");
    setPlayerPhotoUrlDraft("");
    setPlayerExistingPhotoUrl(null);
    setPlayerPreparedPhoto(null);
    setPlayerPhotoTouched(false);
    setPlayerPriorityGroupDraftId(overview?.priorityGroups[0]?.id ?? null);
    setPlayerPreferredPositionIds([]);
    setPlayerAgeDraft("");
    setPlayerRatingDraft("");
    setPlayerDominantSideDraft(null);
    setPlayerNotesDraft("");
    setPlayerWeeklyDefaultDraft(true);
  }

  function closePlayerModal() {
    setPlayerModal(null);
    setIsSubmittingModal(false);
    resetPlayerForm();
  }

  function fillPlayerForm(item: AccountPlayerAdminItem) {
    setPlayerNameDraft(item.player.full_name);
    setPlayerEmailDraft(item.player.email ?? item.linkedProfile?.email ?? "");
    setPlayerPhotoUrlDraft(item.player.photo_url ?? item.linkedProfile?.photo_url ?? "");
    setPlayerExistingPhotoUrl(item.player.photo_url ?? item.linkedProfile?.photo_url ?? null);
    setPlayerPreparedPhoto(null);
    setPlayerPhotoTouched(false);
    setPlayerPriorityGroupDraftId(item.player.priority_group_id ?? overview?.priorityGroups[0]?.id ?? null);
    setPlayerPreferredPositionIds(item.preferredPositions.map((position) => position.id));
    setPlayerAgeDraft(item.player.age !== null ? String(item.player.age) : "");
    setPlayerRatingDraft(item.player.rating !== null ? item.player.rating.toFixed(2) : "");
    setPlayerDominantSideDraft(item.player.dominant_side);
    setPlayerNotesDraft(item.player.notes ?? "");
    setPlayerWeeklyDefaultDraft(item.player.is_default_for_weekly_list);
  }

  function openCreatePlayerModal() {
    if (!canManagePlayers) {
      return;
    }

    resetPlayerForm();
    setPlayerModal({ mode: "create" });
  }

  function openEditPlayerModal(item: AccountPlayerAdminItem) {
    fillPlayerForm(item);
    setPlayerModal({ mode: "edit", targetId: item.player.id });
  }

  function openSelfPlayerModal() {
    if (!profile || !selectedAccess) {
      return;
    }

    if (currentPlayer) {
      fillPlayerForm(currentPlayer);
    } else {
      resetPlayerForm();
      setPlayerNameDraft(profile.full_name ?? "");
      setPlayerEmailDraft(profile.email ?? "");
      setPlayerPhotoUrlDraft(profile.photo_url ?? "");
      setPlayerExistingPhotoUrl(profile.photo_url ?? null);
      setPlayerPriorityGroupDraftId(
        selectedMembership?.priorityGroup?.id ?? overview?.priorityGroups[0]?.id ?? null,
      );
    }

    setPlayerModal({ mode: "self", targetId: currentPlayer?.player.id });
  }

  function togglePreferredPosition(positionId: string) {
    setPlayerPreferredPositionIds((currentValue) =>
      currentValue.includes(positionId)
        ? currentValue.filter((item) => item !== positionId)
        : [...currentValue, positionId],
    );
  }

  function openPhotoSourcePicker(onLibrary: () => void, onCamera: () => void) {
    if (Platform.OS === "web") {
      onLibrary();
      return;
    }

    Alert.alert("Foto do jogador", "Escolha como deseja definir a foto.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Galeria", onPress: onLibrary },
      { text: "Tirar foto", onPress: onCamera },
    ]);
  }

  async function handlePickPlayerPhotoFromLibrary() {
    try {
      const preparedPhoto = await pickAndPreparePlayerPhotoFromLibrary();

      if (!preparedPhoto) {
        return;
      }

      setPlayerPreparedPhoto(preparedPhoto);
      setPlayerPhotoTouched(true);
    } catch (photoError) {
      setMessage({ tone: "error", text: getReadableError(photoError) });
    }
  }

  async function handleTakePlayerPhoto() {
    try {
      const preparedPhoto = await takeAndPreparePlayerPhoto();

      if (!preparedPhoto) {
        return;
      }

      setPlayerPreparedPhoto(preparedPhoto);
      setPlayerPhotoTouched(true);
    } catch (photoError) {
      setMessage({ tone: "error", text: getReadableError(photoError) });
    }
  }

  function handleClearPlayerPhoto() {
    setPlayerPreparedPhoto(null);
    setPlayerPhotoUrlDraft("");
    setPlayerPhotoTouched(true);
  }

  async function reloadSelectedAccountData() {
    if (!selectedAccess) {
      return;
    }

    const [nextOverview, nextPlayers, nextPositions] = await Promise.all([
      getAccountOverview(selectedAccess.account.id),
      listAccountPlayers(selectedAccess.account.id, selectedAccess.account.modality_id),
      listModalityPositions(selectedAccess.account.modality_id),
    ]);

    setOverview(nextOverview);
    setAccountPlayers(nextPlayers);
    setModalityPositions(nextPositions);
  }

  async function resolveLinkedProfileId(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      return null;
    }

    const linkedProfile = await findProfileByEmail(normalizedEmail);
    return linkedProfile?.id ?? null;
  }

  async function shareManualAccessLink(input: {
    fullName: string;
    email: string;
    actionLink: string;
  }) {
    if (Platform.OS === "web") {
      return false;
    }

    await Share.share({
      title: "Primeiro acesso ao BoraJogar",
      message: `Convite de acesso ao BoraJogar para ${input.fullName} (${input.email}).\n\nAbra este link para definir a senha:\n${input.actionLink}`,
    });

    return true;
  }

  async function maybeUploadManagedPhoto(input: {
    accountId: string;
    playerId: string;
    fullName: string;
    normalizedEmail: string | null;
    linkedProfileId: string | null;
    playerAge: number | null;
    playerRating: number | null;
    playerDominantSide: DominantSide | null;
    playerNotes: string | null;
    priorityGroupId: string | null;
    isDefaultForWeeklyList: boolean;
    preferredPositionIds: string[];
  }) {
    if (playerPreparedPhoto) {
      const uploadedPhotoUrl = await uploadPreparedPlayerPhoto({
        accountId: input.accountId,
        playerId: input.playerId,
        preparedPhoto: playerPreparedPhoto,
        existingPhotoUrl: playerExistingPhotoUrl,
      });

      await updateAccountPlayer({
        playerId: input.playerId,
        fullName: input.fullName,
        email: input.normalizedEmail,
        photoUrl: uploadedPhotoUrl,
        age: input.playerAge,
        rating: input.playerRating,
        dominantSide: input.playerDominantSide,
        notes: input.playerNotes,
        linkedProfileId: input.linkedProfileId,
        priorityGroupId: input.priorityGroupId,
        isDefaultForWeeklyList: input.isDefaultForWeeklyList,
        preferredPositionIds: input.preferredPositionIds,
      });
    } else if (
      playerPhotoTouched &&
      !playerPhotoUrlDraft.trim() &&
      isManagedPlayerPhotoUrl(playerExistingPhotoUrl)
    ) {
      await deleteManagedPlayerPhoto(playerExistingPhotoUrl);
    }
  }

  async function handleSavePlayer() {
    if (!profile || !selectedAccess) {
      return;
    }

    if (!playerNameDraft.trim()) {
      setMessage({ tone: "error", text: "Informe o nome do jogador." });
      return;
    }

    setIsSubmittingModal(true);
    setMessage(null);

    try {
      const playerAge = parseOptionalPlayerAge(playerAgeDraft);
      const playerNotes = normalizeOptionalNotes(playerNotesDraft);
      const desiredPhotoUrl = playerPhotoTouched
        ? playerPhotoUrlDraft.trim() || null
        : playerPhotoUrlDraft.trim() || null;

      if (playerModal?.mode === "self") {
        const normalizedEmail =
          profile.email?.trim().toLowerCase() ?? currentPlayer?.player.email?.trim().toLowerCase() ?? null;
        const playerRating = currentPlayer?.player.rating ?? null;
        const playerDominantSide = playerDominantSideDraft;
        const priorityGroupId =
          currentPlayer?.player.priority_group_id ??
          selectedMembership?.priorityGroup?.id ??
          overview?.priorityGroups[0]?.id ??
          null;
        const isDefaultForWeeklyList = currentPlayer?.player.is_default_for_weekly_list ?? true;
        const fullName = playerNameDraft.trim();
        let savedPlayerId: string | null = null;

        if (currentPlayer) {
          await updateAccountPlayer({
            playerId: currentPlayer.player.id,
            fullName,
            email: normalizedEmail,
            photoUrl: desiredPhotoUrl,
            age: playerAge,
            rating: playerRating,
            dominantSide: playerDominantSide,
            notes: playerNotes,
            linkedProfileId: profile.id,
            priorityGroupId,
            isDefaultForWeeklyList,
            preferredPositionIds: playerPreferredPositionIds,
          });
          savedPlayerId = currentPlayer.player.id;
        } else {
          const createdPlayer = await createAccountPlayer({
            accountId: selectedAccess.account.id,
            fullName,
            email: normalizedEmail,
            photoUrl: desiredPhotoUrl,
            age: playerAge,
            rating: null,
            dominantSide: playerDominantSide,
            notes: playerNotes,
            linkedProfileId: profile.id,
            priorityGroupId,
            isDefaultForWeeklyList: true,
            createdBy: profile.id,
            preferredPositionIds: playerPreferredPositionIds,
          });
          savedPlayerId = createdPlayer.id;
        }

        if (savedPlayerId) {
          await maybeUploadManagedPhoto({
            accountId: selectedAccess.account.id,
            playerId: savedPlayerId,
            fullName,
            normalizedEmail,
            linkedProfileId: profile.id,
            playerAge,
            playerRating,
            playerDominantSide,
            playerNotes,
            priorityGroupId,
            isDefaultForWeeklyList,
            preferredPositionIds: playerPreferredPositionIds,
          });
        }

        await updateProfileBasics({
          profileId: profile.id,
          fullName,
        });
        await refresh();
        await reloadSelectedAccountData();
        closePlayerModal();
        setMessage({
          tone: "success",
          text: currentPlayer ? "Seu cadastro esportivo foi atualizado." : "Seu cadastro esportivo foi criado.",
        });
        return;
      }

      if (!canManagePlayers) {
        setMessage({ tone: "error", text: "Voce nao tem permissao para cadastrar jogadores." });
        return;
      }

      if (overview?.priorityGroups.length && !playerPriorityGroupDraftId) {
        setMessage({ tone: "error", text: "Selecione o grupo prioritario do jogador." });
        return;
      }

      const normalizedPlayerEmail = playerEmailDraft.trim().toLowerCase() || null;
      const playerRating = parseOptionalPlayerRating(playerRatingDraft);
      const playerDominantSide = playerDominantSideDraft;
      let linkedProfileId = await resolveLinkedProfileId(normalizedPlayerEmail ?? "");
      let invitedAccess = false;
      let manualActionLink: string | null = null;
      let provisionedAccess: ProvisionedAuthProfile | null = null;
      let savedPlayerId: string | null = null;
      const isEditing = playerModal?.mode === "edit" && playerModal.targetId;
      const fullName = playerNameDraft.trim();

      if (!linkedProfileId && normalizedPlayerEmail) {
        provisionedAccess = await ensurePlayerLoginAccess({
          accountId: selectedAccess.account.id,
          email: normalizedPlayerEmail,
          fullName,
        });

        linkedProfileId = provisionedAccess.profileId;
        invitedAccess = provisionedAccess.invited;
        manualActionLink = provisionedAccess.manualActionLink;
      }

      if (isEditing && playerModal.targetId) {
        await updateAccountPlayer({
          playerId: playerModal.targetId,
          fullName,
          email: normalizedPlayerEmail,
          photoUrl: desiredPhotoUrl,
          age: playerAge,
          rating: playerRating,
          dominantSide: playerDominantSide,
          notes: playerNotes,
          linkedProfileId,
          priorityGroupId: playerPriorityGroupDraftId,
          isDefaultForWeeklyList: playerWeeklyDefaultDraft,
          preferredPositionIds: playerPreferredPositionIds,
        });
        savedPlayerId = playerModal.targetId;
      } else {
        const createdPlayer = await createAccountPlayer({
          accountId: selectedAccess.account.id,
          fullName,
          email: normalizedPlayerEmail,
          photoUrl: desiredPhotoUrl,
          age: playerAge,
          rating: playerRating,
          dominantSide: playerDominantSide,
          notes: playerNotes,
          linkedProfileId,
          priorityGroupId: playerPriorityGroupDraftId,
          isDefaultForWeeklyList: playerWeeklyDefaultDraft,
          createdBy: profile.id,
          preferredPositionIds: playerPreferredPositionIds,
        });
        savedPlayerId = createdPlayer.id;
      }

      if (savedPlayerId) {
        await maybeUploadManagedPhoto({
          accountId: selectedAccess.account.id,
          playerId: savedPlayerId,
          fullName,
          normalizedEmail: normalizedPlayerEmail,
          linkedProfileId,
          playerAge,
          playerRating,
          playerDominantSide,
          playerNotes,
          priorityGroupId: playerPriorityGroupDraftId,
          isDefaultForWeeklyList: playerWeeklyDefaultDraft,
          preferredPositionIds: playerPreferredPositionIds,
        });
      }

      await reloadSelectedAccountData();
      await refresh();
      closePlayerModal();

      const sharedManualLink =
        invitedAccess && manualActionLink && provisionedAccess
          ? await shareManualAccessLink({
              fullName: provisionedAccess.fullName || fullName,
              email: provisionedAccess.email || normalizedPlayerEmail || "",
              actionLink: manualActionLink,
            })
          : false;

      setMessage({
        tone: "success",
        text: linkedProfileId && normalizedPlayerEmail
          ? invitedAccess
            ? sharedManualLink
              ? "Jogador salvo. O limite de email do Supabase foi atingido e o link de primeiro acesso foi aberto para compartilhamento."
              : "Jogador salvo e o convite para definir a senha foi enviado por email."
            : "Jogador salvo e associado ao login existente."
          : "Jogador salvo na conta esportiva.",
      });
    } catch (saveError) {
      setMessage({ tone: "error", text: getReadableError(saveError) });
    } finally {
      setIsSubmittingModal(false);
    }
  }

  async function handleDeactivatePlayer(item: AccountPlayerAdminItem) {
    setDeletingPlayerId(item.player.id);
    setMessage(null);

    try {
      await deactivateAccountPlayer(item.player.id);
      await reloadSelectedAccountData();

      if (currentPlayer?.player.id === item.player.id) {
        await refresh();
      }

      setMessage({ tone: "success", text: "Jogador removido da conta esportiva." });
    } catch (removeError) {
      setMessage({ tone: "error", text: getReadableError(removeError) });
    } finally {
      setDeletingPlayerId(null);
    }
  }

  function confirmDeactivatePlayer(item: AccountPlayerAdminItem) {
    Alert.alert(
      "Remover jogador",
      `Deseja remover ${item.player.full_name} do elenco desta conta?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: () => {
            void handleDeactivatePlayer(item);
          },
        },
      ],
    );
  }

  const playersWithLoginCount = accountPlayers.filter((item) => Boolean(item.linkedProfile)).length;
  const defaultWeeklyCount = accountPlayers.filter((item) => item.player.is_default_for_weekly_list).length;
  const isSelfModal = playerModal?.mode === "self";
  const dominantSideLabel = getDominantSideLabel(overview?.modality.name);

  function renderPlayerModal() {
    if (!playerModal || !selectedAccess) {
      return null;
    }

    const showManagerFields = !isSelfModal;
    const modalTitle =
      playerModal.mode === "create"
        ? "Cadastrar jogador"
        : playerModal.mode === "edit"
          ? "Editar jogador"
          : "Meu cadastro esportivo";

    return (
      <Modal transparent animationType="slide" visible onRequestClose={closePlayerModal}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 18}
            style={styles.modalKeyboard}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.flex}>
                  <Text style={styles.modalTitle}>{modalTitle}</Text>
                  <Text style={styles.modalSubtitle}>
                    {isSelfModal
                      ? "Atualize seu cadastro esportivo. Grupo prioritario e nota tecnica continuam controlados pela conta."
                      : "Cadastre jogadores com ou sem login no BoraJogar, incluindo foto, prioridade e posicoes favoritas."}
                  </Text>
                </View>
                <Pressable onPress={closePlayerModal} style={styles.ghostButton}>
                  <Text style={styles.ghostButtonText}>Fechar</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={Platform.OS === "web"}>
                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>Dados principais</Text>

                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Nome do jogador</Text>
                    <TextInput
                      value={playerNameDraft}
                      onChangeText={setPlayerNameDraft}
                      placeholder="Nome completo"
                      placeholderTextColor={Colors.textMuted}
                      style={styles.input}
                    />
                  </View>

                  {showManagerFields ? (
                    <View style={styles.fieldBlock}>
                      <Text style={styles.label}>Email do jogador (opcional)</Text>
                      <Text style={styles.fieldHint}>
                        Se o email ja existir, o login sera vinculado. Se nao existir, o BoraJogar cria o acesso e envia o convite.
                      </Text>
                      <TextInput
                        value={playerEmailDraft}
                        onChangeText={setPlayerEmailDraft}
                        placeholder="email@exemplo.com"
                        placeholderTextColor={Colors.textMuted}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        style={styles.input}
                      />
                    </View>
                  ) : (
                    <View style={styles.readOnlyCard}>
                      <Text style={styles.readOnlyLabel}>Email do login</Text>
                      <Text style={styles.readOnlyValue}>{profile?.email ?? "Sem email"}</Text>
                    </View>
                  )}

                  <PlayerPhotoField
                    label="Foto do jogador"
                    hint="Voce pode tirar a foto na hora ou escolher da galeria. O BoraJogar recorta no formato quadrado e salva uma versao leve."
                    previewUri={(playerPreparedPhoto?.uri ?? playerPhotoUrlDraft.trim()) || null}
                    onPick={() =>
                      openPhotoSourcePicker(
                        () => void handlePickPlayerPhotoFromLibrary(),
                        () => void handleTakePlayerPhoto(),
                      )
                    }
                    onClear={handleClearPlayerPhoto}
                    disabled={isSubmittingModal}
                  />

                  <View style={styles.row}>
                    <View style={[styles.fieldBlock, styles.flex]}>
                      <Text style={styles.label}>Idade</Text>
                      <Text style={styles.fieldHint}>Opcional. Informe em anos.</Text>
                      <TextInput
                        value={playerAgeDraft}
                        onChangeText={setPlayerAgeDraft}
                        placeholder="Ex.: 32"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="number-pad"
                        style={styles.input}
                      />
                    </View>

                    {showManagerFields ? (
                      <View style={[styles.fieldBlock, styles.flex]}>
                        <Text style={styles.label}>Nota tecnica</Text>
                        <Text style={styles.fieldHint}>De 0 a 10, com ate 2 casas decimais.</Text>
                        <TextInput
                          value={playerRatingDraft}
                          onChangeText={setPlayerRatingDraft}
                          placeholder="Ex.: 7,50"
                          placeholderTextColor={Colors.textMuted}
                          keyboardType="decimal-pad"
                          style={styles.input}
                        />
                      </View>
                    ) : (
                      <View style={[styles.readOnlyCard, styles.flex]}>
                        <Text style={styles.readOnlyLabel}>Nota tecnica</Text>
                        <Text style={styles.readOnlyValue}>
                          {formatPlayerRating(currentPlayer?.player.rating ?? null)}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>{dominantSideLabel}</Text>
                    <Text style={styles.fieldHint}>
                      Use a lateralidade dominante do atleta nesta modalidade. Isso ajuda na montagem automatica dos times.
                    </Text>
                    <View style={styles.chips}>
                      <Pressable
                        onPress={() => setPlayerDominantSideDraft("right")}
                        style={[styles.chip, playerDominantSideDraft === "right" && styles.chipSelected]}>
                        <Text
                          style={[
                            styles.chipText,
                            playerDominantSideDraft === "right" && styles.chipTextSelected,
                          ]}>
                          Destro
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setPlayerDominantSideDraft("left")}
                        style={[styles.chip, playerDominantSideDraft === "left" && styles.chipSelected]}>
                        <Text
                          style={[
                            styles.chipText,
                            playerDominantSideDraft === "left" && styles.chipTextSelected,
                          ]}>
                          Canhoto
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setPlayerDominantSideDraft(null)}
                        style={[styles.chip, playerDominantSideDraft === null && styles.chipSelected]}>
                        <Text
                          style={[
                            styles.chipText,
                            playerDominantSideDraft === null && styles.chipTextSelected,
                          ]}>
                          Nao informado
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Observacao</Text>
                    <Text style={styles.fieldHint}>
                      Use para registrar restricoes, estilo de jogo ou qualquer detalhe util na montagem dos times.
                    </Text>
                    <TextInput
                      value={playerNotesDraft}
                      onChangeText={setPlayerNotesDraft}
                      placeholder="Ex.: prefere jogar aberto, evita partidas muito longas..."
                      placeholderTextColor={Colors.textMuted}
                      style={[styles.input, styles.multiline]}
                      multiline
                    />
                  </View>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>
                    {showManagerFields ? "Prioridade e posicoes" : "Perfil esportivo"}
                  </Text>

                  {showManagerFields ? (
                    <View style={styles.fieldBlock}>
                      <Text style={styles.label}>Grupo prioritario</Text>
                      <View style={styles.chips}>
                        {overview?.priorityGroups.map((group) => (
                          <Pressable
                            key={group.id}
                            onPress={() => setPlayerPriorityGroupDraftId(group.id)}
                            style={[
                              styles.chip,
                              playerPriorityGroupDraftId === group.id && styles.chipSelected,
                            ]}>
                            <Text
                              style={[
                                styles.chipText,
                                playerPriorityGroupDraftId === group.id && styles.chipTextSelected,
                              ]}>
                              {group.priority_rank}. {group.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.readOnlyCard}>
                      <Text style={styles.readOnlyLabel}>Grupo prioritario</Text>
                      <Text style={styles.readOnlyValue}>
                        {currentPlayer?.priorityGroup?.name ?? selectedMembership?.priorityGroup?.name ?? "Nao definido"}
                      </Text>
                    </View>
                  )}

                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Posicoes favoritas</Text>
                    <Text style={styles.fieldHint}>
                      Toque para montar a ordem de preferencia. O primeiro chip selecionado vira a posicao principal.
                    </Text>
                    <View style={styles.chips}>
                      {modalityPositions.map((position) => {
                        const selectedIndex = playerPreferredPositionIds.indexOf(position.id);
                        const isSelected = selectedIndex >= 0;

                        return (
                          <Pressable
                            key={position.id}
                            onPress={() => togglePreferredPosition(position.id)}
                            style={[styles.chip, isSelected && styles.chipSelected]}>
                            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                              {isSelected ? `${selectedIndex + 1}. ` : ""}
                              {position.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {showManagerFields ? (
                  <View style={styles.formSection}>
                    <Text style={styles.formSectionTitle}>Lista base semanal</Text>
                    <Text style={styles.fieldHint}>
                      Define se esse jogador entra por padrao na chamada da semana antes dos ajustes manuais.
                    </Text>
                    <View style={styles.chips}>
                      <Pressable
                        onPress={() => setPlayerWeeklyDefaultDraft(true)}
                        style={[styles.chip, playerWeeklyDefaultDraft && styles.chipSelected]}>
                        <Text style={[styles.chipText, playerWeeklyDefaultDraft && styles.chipTextSelected]}>
                          Entrar na lista
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setPlayerWeeklyDefaultDraft(false)}
                        style={[styles.chip, !playerWeeklyDefaultDraft && styles.chipSelected]}>
                        <Text style={[styles.chipText, !playerWeeklyDefaultDraft && styles.chipTextSelected]}>
                          Fora da lista
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.readOnlyCard}>
                    <Text style={styles.readOnlyLabel}>Lista base semanal</Text>
                    <Text style={styles.readOnlyValue}>
                      {currentPlayer?.player.is_default_for_weekly_list ? "Entra por padrao" : "Fora da lista base"}
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={() => void handleSavePlayer()}
                  disabled={isSubmittingModal}
                  style={[styles.primaryButton, isSubmittingModal && styles.buttonDisabled]}>
                  {isSubmittingModal ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {playerModal.mode === "create"
                        ? "Cadastrar jogador"
                        : isSelfModal
                          ? "Salvar meu cadastro"
                          : "Salvar jogador"}
                    </Text>
                  )}
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
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.contentInner}>
          <View style={styles.header}>
            <Text style={styles.title}>Elenco</Text>
            <Text style={styles.subtitle}>
              Cadastre os jogadores da conta, mantenha o perfil esportivo atualizado e consulte quem esta apto a entrar nos eventos.
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
              <Text style={styles.panelTitle}>Nenhuma conta esportiva disponivel</Text>
              <Text style={styles.panelText}>
                Associe este usuario a uma conta ou cadastre a primeira conta no BoraJogar.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{selectedAccess.account.name}</Text>
                <Text style={styles.panelText}>Modalidade: {overview?.modality.name ?? "Carregando..."}</Text>
                <Text style={styles.panelText}>Seu papel: {selectedAccess.roleLabel}</Text>
                <Text style={styles.panelText}>
                  Grupo prioritario: {selectedAccess.priorityGroupName ?? "Nao definido"}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{accountPlayers.length}</Text>
                  <Text style={styles.summaryLabel}>Jogadores cadastrados</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{playersWithLoginCount}</Text>
                  <Text style={styles.summaryLabel}>Com login</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{defaultWeeklyCount}</Text>
                  <Text style={styles.summaryLabel}>Base semanal</Text>
                </View>
              </View>

              {selectedMembership || currentPlayer ? (
                <View style={styles.panel}>
                  <View style={styles.inlineHeader}>
                    <View style={styles.inlineHeaderContent}>
                      <Text style={styles.sectionTitle}>Meu cadastro esportivo</Text>
                      <Text style={styles.panelText}>
                        Edite aqui suas informacoes esportivas. O grupo prioritario continua somente leitura.
                      </Text>
                    </View>
                    <Pressable onPress={openSelfPlayerModal} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>
                        {currentPlayer ? "Editar meu cadastro" : "Criar meu cadastro"}
                      </Text>
                    </Pressable>
                  </View>

                  {currentPlayer ? (
                    <View style={styles.playerCard}>
                      <View style={styles.playerCardHeader}>
                        <PlayerAvatar
                          name={currentPlayer.player.full_name}
                          photoUrl={currentPlayer.player.photo_url}
                          size={56}
                        />
                        <View style={styles.flex}>
                          <Text style={styles.playerName}>{currentPlayer.player.full_name}</Text>
                          <Text style={styles.playerMeta}>
                            {profile?.email ?? currentPlayer.player.email ?? "Sem email"}
                          </Text>
                          <Text style={styles.playerMeta}>
                            Grupo: {currentPlayer.priorityGroup?.name ?? selectedMembership?.priorityGroup?.name ?? "Nao definido"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.inlineWrap}>
                        <View style={styles.secondaryTag}>
                          <Text style={styles.secondaryTagText}>
                            Idade: {currentPlayer.player.age !== null ? `${currentPlayer.player.age} anos` : "Nao informada"}
                          </Text>
                        </View>
                        <View style={styles.secondaryTag}>
                          <Text style={styles.secondaryTagText}>
                            Nota: {formatPlayerRating(currentPlayer.player.rating)}
                          </Text>
                        </View>
                        <View style={styles.secondaryTag}>
                          <Text style={styles.secondaryTagText}>
                            {dominantSideLabel}: {formatDominantSide(currentPlayer.player.dominant_side)}
                          </Text>
                        </View>
                        <View style={styles.secondaryTag}>
                          <Text style={styles.secondaryTagText}>
                            {currentPlayer.player.is_default_for_weekly_list
                              ? "Entra na base semanal"
                              : "Fora da base semanal"}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.playerMeta}>
                        Posicoes:{" "}
                        {currentPlayer.preferredPositions.length > 0
                          ? currentPlayer.preferredPositions.map((position) => position.name).join(", ")
                          : "Nao informadas"}
                      </Text>
                      {currentPlayer.player.notes ? (
                        <Text style={styles.playerMeta}>Observacao: {currentPlayer.player.notes}</Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={styles.panelText}>
                      Seu cadastro esportivo ainda nao foi criado nesta conta. Use o botao acima para criar.
                    </Text>
                  )}
                </View>
              ) : null}

              <View style={styles.section}>
                <View style={styles.inlineHeader}>
                  <View style={styles.inlineHeaderContent}>
                    <Text style={styles.sectionTitle}>Jogadores da conta</Text>
                    <Text style={styles.panelText}>
                      {canManagePlayers
                        ? "Gerencie aqui todos os jogadores da conta, com ou sem login no BoraJogar."
                        : "Consulte aqui o elenco esportivo vinculado a esta conta."}
                    </Text>
                  </View>
                  {canManagePlayers ? (
                    <Pressable onPress={openCreatePlayerModal} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Novo jogador</Text>
                    </Pressable>
                  ) : null}
                </View>

                {isLoading && accountPlayers.length === 0 ? (
                  <View style={styles.loadingCard}>
                    <ActivityIndicator color={Colors.tint} />
                    <Text style={styles.loadingText}>Carregando elenco da conta...</Text>
                  </View>
                ) : accountPlayers.length > 0 ? (
                  accountPlayers.map((item) => (
                    <View key={item.player.id} style={styles.playerCard}>
                      <View style={styles.playerCardHeader}>
                        <PlayerAvatar name={item.player.full_name} photoUrl={item.player.photo_url} />
                        <View style={styles.flex}>
                          <Text style={styles.playerName}>{item.player.full_name}</Text>
                          <Text style={styles.playerMeta}>
                            {item.player.email ?? "Sem email"} |{" "}
                            {item.linkedProfile ? "Login vinculado" : "Sem login vinculado"}
                          </Text>
                          <Text style={styles.playerMeta}>
                            Prioridade: {item.priorityGroup?.name ?? "Nao definida"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.inlineWrap}>
                        <View style={styles.secondaryTag}>
                          <Text style={styles.secondaryTagText}>
                            Idade: {item.player.age !== null ? `${item.player.age} anos` : "Nao informada"}
                          </Text>
                        </View>
                        <View style={styles.secondaryTag}>
                          <Text style={styles.secondaryTagText}>
                            Nota: {formatPlayerRating(item.player.rating)}
                          </Text>
                        </View>
                        <View style={styles.secondaryTag}>
                          <Text style={styles.secondaryTagText}>
                            {dominantSideLabel}: {formatDominantSide(item.player.dominant_side)}
                          </Text>
                        </View>
                        <View style={styles.secondaryTag}>
                          <Text style={styles.secondaryTagText}>
                            {item.player.is_default_for_weekly_list
                              ? "Entra na base semanal"
                              : "Fora da base semanal"}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.playerMeta}>
                        Posicoes:{" "}
                        {item.preferredPositions.length > 0
                          ? item.preferredPositions.map((position) => position.name).join(", ")
                          : "Nao informadas"}
                      </Text>
                      {item.player.notes ? (
                        <Text style={styles.playerMeta}>Observacao: {item.player.notes}</Text>
                      ) : null}

                      {canManagePlayers ? (
                        <View style={styles.listActions}>
                          <Pressable
                            onPress={() => openEditPlayerModal(item)}
                            style={styles.inlineActionButton}>
                            <Text style={styles.inlineActionText}>Editar</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => confirmDeactivatePlayer(item)}
                            disabled={deletingPlayerId === item.player.id}
                            style={[
                              styles.inlineDangerButton,
                              deletingPlayerId === item.player.id && styles.buttonDisabled,
                            ]}>
                            <Text style={styles.inlineDangerText}>
                              {deletingPlayerId === item.player.id ? "Removendo..." : "Remover"}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Nenhum jogador cadastrado ainda</Text>
                    <Text style={styles.panelText}>
                      {canManagePlayers
                        ? "Use o botao acima para montar o primeiro elenco da conta."
                        : "O admin do grupo ainda nao cadastrou jogadores nesta conta."}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}

          {message ? (
            <View
              style={[
                styles.messageCard,
                message.tone === "success" ? styles.messageSuccess : styles.messageError,
              ]}>
              <Text
                style={[
                  styles.messageText,
                  message.tone === "success" ? styles.messageTextSuccess : styles.messageTextError,
                ]}>
                {message.text}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
      {renderPlayerModal()}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  contentInner: {
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
    gap: 16,
  },
  header: {
    gap: 6,
  },
  title: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "900",
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
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
    backgroundColor: "#eef6e8",
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
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 8,
  },
  panelTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  panelText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  summaryCard: {
    minWidth: "30%",
    flexGrow: 1,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 6,
  },
  summaryValue: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "900",
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  inlineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  inlineHeaderContent: {
    flex: 1,
    gap: 4,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: Colors.tint,
    fontSize: 14,
    fontWeight: "800",
  },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  playerCard: {
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  playerCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  playerName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  playerMeta: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  inlineWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryTag: {
    borderRadius: 999,
    backgroundColor: Colors.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryTagText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  listActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  inlineActionButton: {
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineActionText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  inlineDangerButton: {
    alignItems: "center",
    backgroundColor: "#fdeceb",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineDangerText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  messageCard: {
    borderRadius: 18,
    padding: 14,
  },
  messageSuccess: {
    backgroundColor: "#e8f6ea",
  },
  messageError: {
    backgroundColor: "#fff2e6",
  },
  messageText: {
    fontSize: 13,
    lineHeight: 20,
  },
  messageTextSuccess: {
    color: "#1f6b37",
  },
  messageTextError: {
    color: "#8f4f00",
  },
  avatarFallback: {
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: Colors.tint,
    fontSize: 16,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 28, 20, 0.48)",
  },
  modalKeyboard: {
    width: "100%",
    maxHeight: "100%",
    flexShrink: 1,
    justifyContent: "center",
  },
  modalCard: {
    maxHeight: "100%",
    width: "100%",
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.background,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 16,
    flexShrink: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  ghostButton: {
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ghostButtonText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  modalContent: {
    gap: 16,
    paddingBottom: 12,
  },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  formSection: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 14,
  },
  formSectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  fieldBlock: {
    gap: 8,
  },
  label: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  fieldHint: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
  multiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  readOnlyCard: {
    borderRadius: 16,
    backgroundColor: Colors.background,
    padding: 14,
    gap: 4,
  },
  readOnlyLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  readOnlyValue: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: Colors.tint,
  },
  chipText: {
    color: Colors.tint,
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextSelected: {
    color: "#ffffff",
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: Colors.tint,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
