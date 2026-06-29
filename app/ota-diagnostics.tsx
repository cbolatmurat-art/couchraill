import React, { useState } from 'react';
import { View, Text, ScrollView, Button, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';

export default function OTADiagnosticsScreen() {
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    console.log(message);
  };

  const checkAndFetchUpdate = async () => {
    setLogs([]);
    try {
      addLog('1. checkForUpdateAsync çağrılıyor...');
      const checkResult = await Updates.checkForUpdateAsync();
      addLog(`Sonuç: isAvailable=${checkResult.isAvailable}`);

      if (checkResult.isAvailable) {
        addLog('2. fetchUpdateAsync çağrılıyor...');
        const fetchResult = await Updates.fetchUpdateAsync();
        addLog(`Sonuç: fetch başarılı. isNew=${fetchResult.isNew}`);
        if (fetchResult.manifest) {
           addLog(`Yeni Update ID: ${(fetchResult.manifest as any).id || 'Bilinmiyor'}`);
        }

        addLog('3. reloadAsync çağrılacak... Uygulama yenileniyor.');
        setTimeout(async () => {
          try {
             await Updates.reloadAsync();
          } catch (reloadErr: any) {
             addLog(`HATA (reloadAsync): ${reloadErr.message}`);
          }
        }, 1500);
      } else {
        addLog('Güncelleme bulunamadı (isAvailable: false). fetchUpdateAsync atlandı.');
      }
    } catch (e: any) {
      addLog(`HATA: ${e.message}`);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>OTA Diagnostics</Text>

      <View style={styles.infoBox}>
        <Text style={styles.text}>Updates.channel: {Updates.channel || 'N/A'}</Text>
        <Text style={styles.text}>Updates.runtimeVersion: {Updates.runtimeVersion || 'N/A'}</Text>
        <Text style={styles.text}>Updates.updateId: {Updates.updateId || 'N/A'}</Text>
        <Text style={styles.text}>Updates.isEmbeddedLaunch: {String(Updates.isEmbeddedLaunch)}</Text>
        <Text style={styles.text}>Updates.createdAt: {Updates.createdAt ? new Date(Updates.createdAt).toLocaleString() : 'N/A'}</Text>
        <Text style={styles.text}>Updates.isEmergencyLaunch: {String(Updates.isEmergencyLaunch)}</Text>
      </View>

      <Button title="Check For Update" onPress={checkAndFetchUpdate} />

      <View style={styles.logBox}>
        <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>Canlı Loglar:</Text>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 50, paddingBottom: 50 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  infoBox: { marginBottom: 20, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 8 },
  text: { fontSize: 14, marginBottom: 5 },
  logBox: { marginTop: 20, padding: 10, backgroundColor: '#333', borderRadius: 8, minHeight: 200 },
  logText: { color: '#0f0', fontSize: 12, marginBottom: 4, fontFamily: 'monospace' }
});
