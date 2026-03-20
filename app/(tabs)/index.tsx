import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { dashboardHighlights, matches, players, weeklyChecklist } from '@/src/data/mock';
import { useAuth } from '@/src/providers/auth-provider';

export default function TabOneScreen() {
  const { profile, memberships, error, signOut } = useAuth();
  const nextMatch = matches.find((match) => match.status !== 'Finalizado') ?? matches[0];
  const spotlightPlayers = [...players].sort((first, second) => second.rating - first.rating).slice(0, 3);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroHalo} />
        <Text style={styles.kicker}>Pelada da semana</Text>
        <Text style={styles.heroTitle}>Tudo pronto para fechar os times de quarta sem planilha solta.</Text>
        <Text style={styles.heroSubtitle}>
          Use essa base para controlar presenca, agenda, retrospecto e destaque da rodada em um fluxo simples.
        </Text>
        <View style={styles.heroFooter}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillValue}>{nextMatch.dateLabel}</Text>
            <Text style={styles.heroPillLabel}>Proximo jogo</Text>
          </View>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillValue}>{nextMatch.confirmedPlayers}/{nextMatch.capacity}</Text>
            <Text style={styles.heroPillLabel}>Confirmados</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        {dashboardHighlights.map((item) => (
          <View key={item.label} style={styles.statCard}>
            <Text style={styles.statValue}>{item.value}</Text>
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conta conectada</Text>
        <View style={styles.accountCard}>
          <View style={styles.accountHeader}>
            <View style={styles.accountIdentity}>
              <Text style={styles.accountName}>{profile?.full_name ?? 'Usuario autenticado'}</Text>
              <Text style={styles.accountMeta}>{profile?.email ?? 'Sem email carregado'}</Text>
            </View>
            <Pressable onPress={() => void signOut()} style={styles.signOutButton}>
              <Text style={styles.signOutText}>Sair</Text>
            </Pressable>
          </View>
          <Text style={styles.accountSummary}>
            {profile?.is_super_admin
              ? 'Perfil com acesso global de super admin.'
              : 'Perfil carregado a partir do Supabase.'}
          </Text>
          {memberships.length > 0 ? (
            memberships.map((item) => (
              <View key={item.membership.id} style={styles.membershipCard}>
                <Text style={styles.membershipName}>{item.account.name}</Text>
                <Text style={styles.membershipMeta}>Papel: {item.membership.role}</Text>
                <Text style={styles.membershipMeta}>
                  Grupo prioritario: {item.priorityGroup?.name ?? 'Nao definido'}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.membershipEmpty}>
              <Text style={styles.membershipEmptyTitle}>Nenhuma conta vinculada ainda</Text>
              <Text style={styles.membershipEmptyText}>
                Depois de rodar a migracao e o seed, associe este usuario em `account_memberships` para validar a
                etapa 1.
              </Text>
            </View>
          )}
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Pendencia de setup</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Jogo em destaque</Text>
        <View style={styles.matchCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{nextMatch.status}</Text>
          </View>
          <Text style={styles.matchTitle}>{nextMatch.title}</Text>
          <Text style={styles.matchMeta}>{nextMatch.location}</Text>
          <Text style={styles.matchMeta}>{nextMatch.notes}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prioridades da semana</Text>
        {weeklyChecklist.map((item) => (
          <View key={item.title} style={styles.checklistCard}>
            <Text style={styles.checklistTitle}>{item.title}</Text>
            <Text style={styles.checklistText}>{item.description}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Destaques do elenco</Text>
        {spotlightPlayers.map((player, index) => (
          <View key={player.id} style={styles.playerRow}>
            <View style={styles.playerRank}>
              <Text style={styles.playerRankText}>#{index + 1}</Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.name}</Text>
              <Text style={styles.playerMeta}>
                {player.position} • {player.goals} gols • {player.assists} assistencias
              </Text>
            </View>
            <Text style={styles.playerScore}>{player.rating.toFixed(1)}</Text>
          </View>
        ))}
      </View>
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
    gap: 18,
  },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: Colors.surfaceStrong,
    padding: 24,
    gap: 14,
  },
  heroHalo: {
    position: 'absolute',
    right: -30,
    top: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(212, 242, 106, 0.22)',
  },
  kicker: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#f8fbf5',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
  },
  heroSubtitle: {
    color: '#d7e5da',
    fontSize: 15,
    lineHeight: 22,
  },
  heroFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  heroPill: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 4,
  },
  heroPillValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  heroPillLabel: {
    color: '#c6d4c9',
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    minWidth: '30%',
    flexGrow: 1,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 6,
  },
  statValue: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  section: {
    gap: 12,
  },
  accountCard: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 12,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  accountIdentity: {
    flex: 1,
    gap: 4,
  },
  accountName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  accountMeta: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  accountSummary: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  signOutButton: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  signOutText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  membershipCard: {
    borderRadius: 18,
    backgroundColor: Colors.background,
    padding: 14,
    gap: 4,
  },
  membershipName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  membershipMeta: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  membershipEmpty: {
    borderRadius: 18,
    backgroundColor: Colors.background,
    padding: 14,
    gap: 6,
  },
  membershipEmptyTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  membershipEmptyText: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  errorCard: {
    borderRadius: 18,
    backgroundColor: '#fff2e6',
    padding: 14,
    gap: 4,
  },
  errorTitle: {
    color: '#8f4f00',
    fontSize: 14,
    fontWeight: '800',
  },
  errorText: {
    color: '#8f4f00',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  matchCard: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: Colors.tint,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  matchTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  matchMeta: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  checklistCard: {
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 6,
  },
  checklistTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  checklistText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  playerRank: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerRankText: {
    color: Colors.tint,
    fontSize: 14,
    fontWeight: '800',
  },
  playerInfo: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  playerMeta: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  playerScore: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
});
