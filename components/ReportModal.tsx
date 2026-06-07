import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../constants/config';
import { AlertHelper } from '../utils/AlertHelper';

export type ContentType = 'post' | 'listing' | 'event' | 'other';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  reporterUserId: string;
  reportedUserId: string;
  contentType: ContentType;
  contentId: string;
}

const REPORT_REASONS = [
  'Spam',
  'Rahatsız Edici İçerik',
  'Yanıltıcı Bilgi',
  'Uygunsuz İçerik',
  'Diğer'
];

export const ReportModal: React.FC<ReportModalProps> = ({ visible, onClose, reporterUserId, reportedUserId, contentType, contentId }) => {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      AlertHelper.alert('Hata', 'Lütfen bir şikayet nedeni seçin.');
      return;
    }
    if (selectedReason === 'Diğer' && !description.trim()) {
      AlertHelper.alert('Hata', 'Lütfen şikayet nedeninizi açıklayın.');
      return;
    }

    setLoading(true);
    try {
      const normalizedReporterId = reporterUserId || "unknown_reporter";
      const requestBody = {
        reporterUserId: normalizedReporterId,
        reportedUserId,
        contentType,
        contentId,
        reason: selectedReason,
        description: selectedReason === 'Diğer' ? description.trim() : null
      };

      console.log('--- REPORT SUBMIT REQUEST ---');
      console.log('URL:', `${API_BASE_URL}/reports`);
      console.log('METHOD: POST');
      console.log('BODY:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${API_BASE_URL}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      console.log('RESPONSE STATUS:', response.status);
      const responseText = await response.text();
      console.log('RESPONSE BODY:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        data = null;
      }

      if (response.ok && data?.success) {
        AlertHelper.alert('Başarılı', 'Şikayetiniz iletildi.');
        handleClose();
      } else {
        AlertHelper.alert('Hata', data?.error || 'Şikayet iletilemedi.');
      }
    } catch (e: any) {
      console.log('FETCH CATCH ERROR:', e.message);
      AlertHelper.alert('Hata', 'Sunucu bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedReason(null);
    setDescription('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Şikayet Et</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>Lütfen bu içeriği neden şikayet ettiğinizi seçin:</Text>

          <View style={styles.reasonList}>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={[styles.reasonButton, selectedReason === reason && styles.reasonButtonActive]}
                onPress={() => setSelectedReason(reason)}
              >
                <View style={styles.radio}>
                  {selectedReason === reason && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.reasonText}>{reason}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {selectedReason === 'Diğer' && (
            <TextInput
              style={styles.input}
              placeholder="Lütfen detaylı açıklama yazın..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
            />
          )}

          <TouchableOpacity style={[styles.submitButton, loading && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitButtonText}>Şikayeti Gönder</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 16
  },
  reasonList: {
    gap: 12,
    marginBottom: 20
  },
  reasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8
  },
  reasonButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF2FF'
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary
  },
  reasonText: {
    fontSize: 15,
    color: Colors.text
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
    fontSize: 14,
    color: Colors.text
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitButtonDisabled: {
    opacity: 0.7
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600'
  }
});
