import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.didi.mahasiswachat',
  appName: 'MahasiswaChat',
  webDir: 'dist' // <--- Pastikan ini 'dist', bukan 'www'
};

export default config;