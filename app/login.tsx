import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Colors from "@/constants/Colors";
import { useAuth } from "@/src/providers/auth-provider";

export default function LoginScreen() {
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (session) {
    return <Redirect href="/" />;
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setMessage(null);

    try {
      if (mode === "sign-in") {
        await signIn(email.trim(), password);
      } else {
        await signUp({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        });
        setMessage("Conta criada. Se o projeto exigir confirmacao por email, conclua esse passo antes do login.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel concluir a autenticacao.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.page}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>Incremento 1</Text>
            <Text style={styles.title}>Autenticacao e bootstrap do Supabase.</Text>
            <Text style={styles.subtitle}>
              Entre com email e senha para validar o primeiro fluxo. Depois disso, o app carrega perfil e contas
              vinculadas.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setMode("sign-in")}
                style={[styles.toggleButton, mode === "sign-in" && styles.toggleButtonActive]}>
                <Text style={[styles.toggleText, mode === "sign-in" && styles.toggleTextActive]}>Entrar</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("sign-up")}
                style={[styles.toggleButton, mode === "sign-up" && styles.toggleButtonActive]}>
                <Text style={[styles.toggleText, mode === "sign-up" && styles.toggleTextActive]}>Criar conta</Text>
              </Pressable>
            </View>

            {mode === "sign-up" ? (
              <View style={styles.field}>
                <Text style={styles.label}>Nome completo</Text>
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setFullName}
                  placeholder="Ex.: Pedro Torres"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                  value={fullName}
                />
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="voce@exemplo.com"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Senha</Text>
              <TextInput
                onChangeText={setPassword}
                placeholder="********"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            {message ? (
              <View style={styles.messageBox}>
                <Text style={styles.messageText}>{message}</Text>
              </View>
            ) : null}

            <Pressable
              disabled={isSubmitting}
              onPress={() => void handleSubmit()}
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}>
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === "sign-in" ? "Entrar com email" : "Criar conta e continuar"}
                </Text>
              )}
            </Pressable>

            <Text style={styles.footnote}>
              Se o banco ainda nao estiver com a migracao aplicada, o login pode entrar mas o bootstrap do perfil vai
              acusar erro na home.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  page: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    gap: 18,
    backgroundColor: Colors.background,
  },
  hero: {
    gap: 10,
  },
  kicker: {
    color: Colors.tint,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: {
    color: Colors.text,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 26,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 14,
  },
  toggleRow: {
    flexDirection: "row",
    borderRadius: 16,
    backgroundColor: Colors.surfaceMuted,
    padding: 4,
    gap: 4,
  },
  toggleButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 10,
  },
  toggleButtonActive: {
    backgroundColor: Colors.surface,
  },
  toggleText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  toggleTextActive: {
    color: Colors.text,
  },
  field: {
    gap: 6,
  },
  label: {
    color: Colors.text,
    fontSize: 13,
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
  messageBox: {
    borderRadius: 16,
    backgroundColor: Colors.surfaceMuted,
    padding: 14,
  },
  messageText: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  submitButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: Colors.tint,
    paddingVertical: 14,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  footnote: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
