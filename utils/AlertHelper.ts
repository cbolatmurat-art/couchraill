import { Platform, Alert as RNAlert } from 'react-native';

export const AlertHelper = {
  alert: (title: string, message?: string, onPress?: () => void) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const fullMessage = message ? `${title}\n${message}` : title;
        window.alert(fullMessage);
      }
      if (onPress) onPress();
    } else {
      RNAlert.alert(title, message || '', [{ text: 'Tamam', onPress }]);
    }
  },

  confirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText: string = 'Evet',
    cancelText: string = 'Hayır',
    isDestructive: boolean = false
  ) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const result = window.confirm(`${title}\n${message}`);
        if (result) {
          onConfirm();
        } else if (onCancel) {
          onCancel();
        }
      }
    } else {
      RNAlert.alert(title, message, [
        { text: cancelText, onPress: onCancel, style: 'cancel' },
        { text: confirmText, onPress: onConfirm, style: isDestructive ? 'destructive' : 'default' }
      ]);
    }
  }
};
