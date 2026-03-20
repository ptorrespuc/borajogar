import { ScrollView, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { roadmapItems } from '@/src/data/mock';

export default function ModalScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.title}>Base inicial pronta</Text>
        <Text style={styles.description}>
          O app ja nasceu com foco em agenda, confirmacao de presenca e acompanhamento do elenco. A partir daqui, o
          proximo passo natural e ligar isso a dados reais.
        </Text>
      </View>

      {roadmapItems.map((item) => (
        <View key={item.title} style={styles.card}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardText}>{item.description}</Text>
        </View>
      ))}
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
    gap: 14,
  },
  hero: {
    borderRadius: 26,
    backgroundColor: Colors.surfaceStrong,
    padding: 22,
    gap: 10,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  description: {
    color: '#d9e5dc',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 6,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardText: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
});
