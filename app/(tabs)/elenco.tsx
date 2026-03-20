import { ScrollView, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { players } from '@/src/data/mock';

export default function ElencoScreen() {
  const confirmedPlayers = players.filter((player) => player.status === 'Confirmado').length;
  const doubtfulPlayers = players.filter((player) => player.status === 'Duvida').length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Elenco e disponibilidade</Text>
        <Text style={styles.subtitle}>
          Visualize rapidamente quem ja confirmou, quem ainda esta em duvida e quais jogadores estao puxando a media.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{confirmedPlayers}</Text>
          <Text style={styles.summaryLabel}>Confirmados</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{doubtfulPlayers}</Text>
          <Text style={styles.summaryLabel}>Em duvida</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {players.map((player) => (
          <View key={player.id} style={styles.playerCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.playerName}>{player.name}</Text>
              <Text style={styles.playerRating}>{player.rating.toFixed(1)}</Text>
            </View>
            <Text style={styles.playerPosition}>{player.position}</Text>
            <View style={styles.tagRow}>
              <View
                style={[
                  styles.statusTag,
                  player.status === 'Confirmado' ? styles.statusTagSuccess : styles.statusTagNeutral,
                ]}>
                <Text style={styles.statusTagText}>{player.status}</Text>
              </View>
              <View style={styles.secondaryTag}>
                <Text style={styles.secondaryTagText}>{player.nickname}</Text>
              </View>
            </View>
            <Text style={styles.playerStats}>
              {player.goals} gols • {player.assists} assistencias
            </Text>
            <Text style={styles.playerNote}>{player.note}</Text>
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
  header: {
    gap: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 6,
  },
  summaryValue: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  playerCard: {
    width: '100%',
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  playerName: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  playerRating: {
    color: Colors.tint,
    fontSize: 18,
    fontWeight: '900',
  },
  playerPosition: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusTagSuccess: {
    backgroundColor: '#e4f4e6',
  },
  statusTagNeutral: {
    backgroundColor: '#f1f3ef',
  },
  statusTagText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  secondaryTag: {
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondaryTagText: {
    color: Colors.tint,
    fontSize: 11,
    fontWeight: '800',
  },
  playerStats: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  playerNote: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
