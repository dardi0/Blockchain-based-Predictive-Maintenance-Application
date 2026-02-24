/**
 * PM2 Ecosystem Config — PDM Automation Event Listener
 *
 * Kullanım:
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup   # sistem yeniden başladığında otomatik başlat
 *   pm2 logs pdm-event-listener
 */
module.exports = {
  apps: [
    {
      name: "pdm-event-listener",

      // Python interpreter: sanal ortam yolunu güncelle
      interpreter: ".venv/bin/python",
      script: "automation_event_listener.py",

      // Çalışma dizini (mutlak yol tercih edilir)
      cwd: "/opt/pdm",

      // --- Yeniden başlatma politikası ---
      // Kilitlenme veya çıkış sonrası her zaman yeniden başlat
      autorestart: true,
      // Başarıyla ayağa kalkmış sayılmak için minimum çalışma süresi (ms)
      min_uptime: "30s",
      // Otomatik yeniden başlatmayı durdurmadan önce maksimum deneme sayısı
      max_restarts: 15,
      // Yeniden başlatmalar arasında bekleme süresi (ms)
      restart_delay: 10000,

      // Dosya izleme kapalı (daemon için gerekmez)
      watch: false,

      // --- Ortam değişkenleri ---
      // .env dosyasını Python kodu zaten yüklüyor;
      // ancak burada da override edebilirsiniz.
      env: {
        NODE_ENV: "production",
        // ZKSYNC_ERA_RPC_URL ve CONTRACT_OWNER_PRIVATE_KEY .env'den gelir
      },

      // --- Log ayarları ---
      out_file: "/var/log/pdm/event-listener-out.log",
      error_file: "/var/log/pdm/event-listener-err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Eski logları gzip ile döndür (pm2-logrotate modülü gerekmez)
      combine_logs: false,
    },
  ],
};
