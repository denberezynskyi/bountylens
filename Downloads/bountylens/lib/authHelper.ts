import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const SCOUT_ID_STORAGE_KEY = '@bountylens_device_scout_id';

export async function getOrCreateScoutId(): Promise<string> {
  try {
    // 1. Якщо юзер авторизований у системі — це його ГОЛОВНИЙ і єдиний ID
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      return session.user.id;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      return user.id;
    }

    // 2. Якщо сесії немає (анонімний гість) — беремо збережений девайс ID
    const existingId = await AsyncStorage.getItem(SCOUT_ID_STORAGE_KEY);
    if (existingId) {
      return existingId;
    }

    // 3. Якщо перший запуск — генеруємо стабільний ID
    const newId = `scout_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await AsyncStorage.setItem(SCOUT_ID_STORAGE_KEY, newId);
    return newId;
  } catch (err) {
    console.warn('getOrCreateScoutId fallback error:', err);
    return `scout_${Date.now()}`;
  }
}