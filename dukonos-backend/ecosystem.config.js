module.exports = {
  apps: [{
    name: 'dukon-backend',
    script: 'server.js',
    cwd: '/home/uz-user/dukonos-backend/dukonos-backend',
    env: {
      PORT: 3000,
      DB_HOST: 'localhost',
      DB_USER: 'sardor_dev',
      DB_PASSWORD: 'DukonDB2026!',
      DB_NAME: 'dukonos_db',
      JWT_SECRET: 'DukonSuperSecretKey2026'
    }
  }]
}
