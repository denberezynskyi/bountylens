import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';

const SUPABASE_URL = 'https://evubmtugssuwwuliygmr.supabase.co';
// Твій збережений ключ
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2dWJtdHVnc3N1d3d1bGl5Z21yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjY2MjEsImV4cCI6MjEwNTk0MjYyMX0.LAaN6VoLFB2sZYgU01arNe4C7O4oYft4qG-cUnCaE5Q';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Завантажує base64 або blob фотографію в бакет proofs
 */
export async function uploadProofImage(base64Data: string, filename: string): Promise<string | null> {
  try {
    const filePath = `${Date.now()}_${filename}.jpg`;
    const { data, error } = await supabase.storage
      .from('proofs')
      .upload(filePath, decode(base64Data), {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('Storage upload error:', error);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from('proofs')
      .getPublicUrl(data.path);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('Upload exception:', err);
    return null;
  }
}