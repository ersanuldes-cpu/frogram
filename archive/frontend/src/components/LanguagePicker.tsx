import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguageStore } from '../store/languageStore';
import { LANGUAGES, type SupportedLanguage } from '../i18n';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

export default function LanguagePicker() {
  const [visible, setVisible] = useState(false);
  const { language, setLanguage } = useLanguageStore();

  const handleSelect = async (code: SupportedLanguage) => {
    await setLanguage(code);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity onPress={() => setVisible(true)} style={styles.globeBtn}>
        <Ionicons name="globe-outline" size={22} color="#6B9E7B" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {LANGUAGES.find(l => l.code === language)?.name || 'Language'}
            </Text>
            <View style={styles.divider} />
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langRow,
                  language === lang.code && styles.langRowActive,
                ]}
                onPress={() => handleSelect(lang.code)}
              >
                <Text style={styles.flag}>{lang.flag}</Text>
                <Text style={[
                  styles.langName,
                  language === lang.code && styles.langNameActive,
                ]}>
                  {lang.name}
                </Text>
                {language === lang.code && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  globeBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '75%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: 4,
  },
  langRowActive: {
    backgroundColor: '#E8F5E9',
  },
  flag: {
    fontSize: 22,
    marginRight: spacing.md,
  },
  langName: {
    fontSize: fontSize.md,
    color: colors.text,
    flex: 1,
    fontWeight: '500',
  },
  langNameActive: {
    fontWeight: '700',
    color: colors.primary,
  },
});
