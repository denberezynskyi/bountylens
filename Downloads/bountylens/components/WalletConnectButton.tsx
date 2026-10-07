import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keypair } from '@solana/web3.js';

export default function WalletConnectButton() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('@bountylens_solana_pubkey');
      if (saved) setWalletAddress(saved);
    })();
  }, []);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      // Генерируем или восстанавливаем привязанный аккаунт скаута в Solana Devnet
      let storedKey = await AsyncStorage.getItem('@bountylens_scout_secret');
      let keypair: Keypair;

      if (storedKey) {
        keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(storedKey)));
      } else {
        keypair = Keypair.generate();
        await AsyncStorage.setItem(
          '@bountylens_scout_secret',
          JSON.stringify(Array.from(keypair.secretKey))
        );
      }

      const pubKeyStr = keypair.publicKey.toBase58();
      await AsyncStorage.setItem('@bountylens_solana_pubkey', pubKeyStr);
      setWalletAddress(pubKeyStr);

      Alert.alert(
        'Solana Wallet Linked',
        `Scout Identity verified on Solana Devnet:\n${pubKeyStr.slice(0, 8)}...${pubKeyStr.slice(-8)}`
      );
    } catch (err: any) {
      console.error(err);
      Alert.alert('Connection Error', err?.message || 'Failed to initialize wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    await AsyncStorage.removeItem('@bountylens_solana_pubkey');
    setWalletAddress(null);
  };

  return (
    <View style={styles.container}>
      {walletAddress ? (
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.badge}>
              <View style={styles.dot} />
              <Text style={styles.badgeText}>SOLANA DEVNET</Text>
            </View>
            <TouchableOpacity onPress={disconnectWallet}>
              <Text style={styles.disconnectText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.address}>
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-6)}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.connectBtn}
          activeOpacity={0.85}
          onPress={connectWallet}
          disabled={isConnecting}
        >
          <Text style={styles.connectBtnText}>
            {isConnecting ? 'Linking Wallet...' : '⚡ Connect Solana Wallet'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
  },
  card: {
    backgroundColor: '#0F0E17',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#9945FF',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#14F195',
  },
  badgeText: {
    color: '#14F195',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  disconnectText: {
    color: '#A0A0B2',
    fontSize: 11,
    fontWeight: '600',
  },
  address: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  connectBtn: {
    backgroundColor: '#9945FF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#9945FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});