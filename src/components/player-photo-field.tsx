import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import Colors from "@/constants/Colors";

type PlayerPhotoFieldProps = {
  label: string;
  hint?: string;
  previewUri: string | null;
  onPick: () => void;
  onClear: () => void;
  disabled?: boolean;
};

export function PlayerPhotoField({
  label,
  hint,
  previewUri,
  onPick,
  onClear,
  disabled = false,
}: PlayerPhotoFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <View style={styles.card}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.preview} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>Sem foto</Text>
            <Text style={styles.placeholderText}>Use uma imagem quadrada ou recorte no preview.</Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            onPress={onPick}
            disabled={disabled}
            style={[styles.secondaryButton, disabled && styles.disabledButton]}>
            <Text style={styles.secondaryButtonText}>
              {previewUri ? "Trocar foto" : "Adicionar foto"}
            </Text>
          </Pressable>
          <Pressable
            onPress={onClear}
            disabled={disabled || !previewUri}
            style={[
              styles.dangerButton,
              (disabled || !previewUri) && styles.disabledButton,
            ]}>
            <Text style={styles.dangerButtonText}>Remover</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldBlock: {
    gap: 8,
  },
  label: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    borderColor: Colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  preview: {
    alignSelf: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 20,
    height: 132,
    width: 132,
  },
  placeholder: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 20,
    gap: 6,
    height: 132,
    justifyContent: "center",
    paddingHorizontal: 18,
    width: 132,
  },
  placeholderTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 999,
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#fdeceb",
    borderRadius: 999,
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dangerButtonText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },
});
