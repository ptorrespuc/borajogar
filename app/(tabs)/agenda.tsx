import { ScrollView, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { matches } from '@/src/data/mock';

export default function AgendaScreen() {
  const upcomingMatches = matches.filter((match) => match.status !== 'Finalizado');
  const previousMatches = matches.filter((match) => match.status === 'Finalizado');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Agenda da quadra</Text>
        <Text style={styles.bannerText}>
          Centralize horario, local, vagas e observacoes para parar de confirmar tudo no grupo de ultima hora.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Proximos jogos</Text>
        {upcomingMatches.map((match) => (
          <View key={match.id} style={styles.matchCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.matchTitle}>{match.title}</Text>
              <View
                style={[
                  styles.statusBadge,
                  match.status === 'Aberto' ? styles.statusBadgeWarning : styles.statusBadgeSuccess,
                ]}>
                <Text style={styles.statusText}>{match.status}</Text>
              </View>
            </View>
            <Text style={styles.matchMeta}>{match.dateLabel}</Text>
            <Text style={styles.matchMeta}>{match.location}</Text>
            <View style={styles.metricStrip}>
              <View style={styles.metricPill}>
                <Text style={styles.metricValue}>{match.confirmedPlayers}</Text>
                <Text style={styles.metricLabel}>Confirmados</Text>
              </View>
              <View style={styles.metricPill}>
                <Text style={styles.metricValue}>{match.capacity - match.confirmedPlayers}</Text>
                <Text style={styles.metricLabel}>Vagas</Text>
              </View>
            </View>
            <Text style={styles.notes}>{match.notes}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Retrospecto recente</Text>
        {previousMatches.map((match) => (
          <View key={match.id} style={styles.historyCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.historyTitle}>{match.title}</Text>
              <Text style={styles.historyScore}>{match.score}</Text>
            </View>
            <Text style={styles.matchMeta}>{match.dateLabel}</Text>
            <Text style={styles.notes}>{match.notes}</Text>
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
  banner: {
    borderRadius: 28,
    backgroundColor: Colors.surfaceMuted,
    padding: 22,
    gap: 10,
  },
  bannerTitle: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  bannerText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  section: {
    gap: 12,
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
  historyCard: {
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  matchTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  historyTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  matchMeta: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeSuccess: {
    backgroundColor: '#e4f4e6',
  },
  statusBadgeWarning: {
    backgroundColor: '#fff0da',
  },
  statusText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricStrip: {
    flexDirection: 'row',
    gap: 10,
  },
  metricPill: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: Colors.background,
    padding: 14,
    gap: 4,
  },
  metricValue: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  metricLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  notes: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  historyScore: {
    color: Colors.tint,
    fontSize: 18,
    fontWeight: '900',
  },
});
