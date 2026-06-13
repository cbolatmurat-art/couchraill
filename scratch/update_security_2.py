import re

with open("app/security.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import { View, Text, StyleSheet, ScrollView, Alert, Modal, Pressable, Image, ActivityIndicator, Platform } from 'react-native';",
    "import { View, Text, StyleSheet, ScrollView, Alert, Modal, Pressable, Image, ActivityIndicator, Platform, LayoutAnimation, UIManager } from 'react-native';\n\nif (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {\n  UIManager.setLayoutAnimationEnabledExperimental(true);\n}"
)

# 2. State
content = content.replace(
    "const [verificationSuccess, setVerificationSuccess] = useState('');",
    "const [verificationSuccess, setVerificationSuccess] = useState('');\n  const [verificationStep, setVerificationStep] = useState(1);"
)

# 3. Logic Methods
logic_new = """
  const doSubmit = async (front: string, back: string, selfie: string) => {
    setIsSubmittingVerification(true);
    setVerificationError('');
    try {
      const result = await submitVerificationRequest(front, back, selfie);
      if (result.success) {
        AlertHelper.alert('Başarılı', 'Başvurunuz başarıyla alındı. İnceleme tamamlandığında size bildirim gönderilecektir.');
        setIdFrontImage(null);
        setIdBackImage(null);
        setSelfieImage(null);
        setVerificationStep(1);
        setIsVerificationModalVisible(false);
      } else {
        setVerificationError(result.error || 'Başvuru gönderilirken hata oluştu.');
      }
    } catch (e: any) {
      setVerificationError(e?.message || 'Sistemsel bir hata oluştu.');
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  const goToNextStep = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVerificationStep(prev => prev + 1);
  };

  const goToPrevStep = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVerificationStep(prev => prev - 1);
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      AlertHelper.alert('İzin Gerekli', 'Fotoğraf çekmek için kamera iznine ihtiyacımız var.');
      return false;
    }
    return true;
  };

  const pickImage = async (type: 'front' | 'back' | 'selfie') => {
    const permission = await requestCameraPermission();
    if (!permission) return;

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'selfie' ? [1, 1] : [4, 3],
      quality: 0.8,
    };

    const result = await ImagePicker.launchCameraAsync(options);

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const imageUri = asset.uri;
      
      if (type === 'front') {
        setIdFrontImage(imageUri);
        setTimeout(() => {
          goToNextStep();
        }, 500);
      } else if (type === 'back') {
        setIdBackImage(imageUri);
        setTimeout(() => {
          goToNextStep();
        }, 500);
      } else if (type === 'selfie') {
        setSelfieImage(imageUri);
        setTimeout(() => {
          doSubmit(idFrontImage as string, idBackImage as string, imageUri);
        }, 500);
      }
    }
  };
"""

# Find where pickImage is and replace up to handleSubmitVerification end
start_idx = content.find("const requestMediaPermission = async () => {")
end_idx = content.find("setIsSubmittingVerification(false);\n    }\n  };") + len("setIsSubmittingVerification(false);\n    }\n  };")

content = content[:start_idx] + logic_new.strip() + content[end_idx:]

# 4. Modal Replacement
modal_start = content.find("{/* Identity Verification Modal */}")
modal_end = content.find("</Modal>") + 8

new_modal = """
      {/* Identity Verification Modal (Bottom Sheet) */}
      <Modal
        visible={isVerificationModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsVerificationModalVisible(false);
          setVerificationStep(1);
        }}
      >
        <View style={styles.bottomSheetOverlay}>
          <Pressable style={styles.bottomSheetBackground} onPress={() => {
            setIsVerificationModalVisible(false);
            setVerificationStep(1);
          }} />
          
          <View style={styles.bottomSheetContent}>
            <View style={styles.bottomSheetHandle} />
            
            <View style={styles.modalHeader}>
              {verificationStep > 1 && !isSubmittingVerification ? (
                <Pressable onPress={goToPrevStep} style={styles.modalBackBtn}>
                  <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </Pressable>
              ) : <View style={{ width: 32 }} />}
              <Text style={[styles.modalTitle, { flex: 1, textAlign: 'center' }]}>Profil Doğrulama</Text>
              {!isSubmittingVerification ? (
                <Pressable onPress={() => {
                  setIsVerificationModalVisible(false);
                  setVerificationStep(1);
                }} style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </Pressable>
              ) : <View style={{ width: 32 }} />}
            </View>

            <Text style={styles.modalStepIndicator}>Adım {verificationStep}/3</Text>

            {verificationError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorTextContent}>{verificationError}</Text>
              </View>
            ) : null}

            {isSubmittingVerification && (
               <View style={{ padding: 20, alignItems: 'center' }}>
                 <ActivityIndicator size="large" color={Colors.primary} />
                 <Text style={{ marginTop: 10, color: Colors.text, fontSize: 16 }}>Başvurunuz gönderiliyor, lütfen bekleyin...</Text>
               </View>
            )}

            {!isSubmittingVerification && verificationStep === 1 && (
              <View style={styles.uploadSection}>
                <Text style={styles.uploadTitle}>Kimlik Ön Yüzü</Text>
                <Text style={styles.modalDesc}>Lütfen kimliğinizin ön yüzünü fotoğraflayın.</Text>
                
                {idFrontImage ? (
                  <View style={styles.previewContainer}>
                    <Image source={{ uri: idFrontImage }} style={styles.docPreview} />
                    <Pressable style={styles.cameraOverlayBtn} onPress={() => pickImage('front')}>
                      <Ionicons name="camera" size={24} color="#FFF" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.placeholderBox} onPress={() => pickImage('front')}>
                    <Ionicons name="camera" size={48} color={Colors.primary} />
                    <Text style={styles.placeholderText}>Fotoğraf Çek</Text>
                  </Pressable>
                )}
              </View>
            )}

            {!isSubmittingVerification && verificationStep === 2 && (
              <View style={styles.uploadSection}>
                <Text style={styles.uploadTitle}>Kimlik Arka Yüzü</Text>
                <Text style={styles.modalDesc}>Lütfen kimliğinizin arka yüzünü fotoğraflayın.</Text>
                
                {idBackImage ? (
                  <View style={styles.previewContainer}>
                    <Image source={{ uri: idBackImage }} style={styles.docPreview} />
                    <Pressable style={styles.cameraOverlayBtn} onPress={() => pickImage('back')}>
                      <Ionicons name="camera" size={24} color="#FFF" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.placeholderBox} onPress={() => pickImage('back')}>
                    <Ionicons name="camera" size={48} color={Colors.primary} />
                    <Text style={styles.placeholderText}>Fotoğraf Çek</Text>
                  </Pressable>
                )}
              </View>
            )}

            {!isSubmittingVerification && verificationStep === 3 && (
              <View style={styles.uploadSection}>
                <Text style={styles.uploadTitle}>Selfie Fotoğrafı</Text>
                <Text style={styles.modalDesc}>Lütfen yüzünüzün net göründüğü bir selfie çekin.</Text>
                
                {selfieImage ? (
                  <View style={styles.previewContainerSelfie}>
                    <Image source={{ uri: selfieImage }} style={styles.docPreviewSelfie} />
                    <Pressable style={styles.cameraOverlayBtnSelfie} onPress={() => pickImage('selfie')}>
                      <Ionicons name="camera" size={24} color="#FFF" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.placeholderBoxSelfie} onPress={() => pickImage('selfie')}>
                    <Ionicons name="camera" size={48} color={Colors.primary} />
                    <Text style={styles.placeholderText}>Selfie Çek</Text>
                  </Pressable>
                )}
              </View>
            )}

          </View>
        </View>
      </Modal>
"""

content = content[:modal_start] + new_modal.strip() + content[modal_end:]

# 5. Styles
styles_to_add = """
  bottomSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheetBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomSheetContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    minHeight: 450,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalBackBtn: {
    padding: 4,
  },
  cameraOverlayBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraOverlayBtnSelfie: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalStepIndicator: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
"""

content = content.replace("  modalContainer: {", styles_to_add + "  modalContainer: {")

# Background color improvements for placeholders
content = content.replace("borderStyle: 'dashed',", "borderStyle: 'dashed',\n    backgroundColor: '#F9F9F9',")

with open("app/security.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("SUCCESS")
