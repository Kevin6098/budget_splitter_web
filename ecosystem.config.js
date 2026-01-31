/**
 * PM2 configuration for Budget Splitter API
 * Port: 3012
 *
 * Usage:
 *   pm2 start ecosystem.config.js              # Uses .env MODE (local or vps)
 *   pm2 start ecosystem.config.js --env local  # Force local (SQLite)
 *   pm2 start ecosystem.config.js --env vps    # Force VPS (PostgreSQL)
 */

module.exports = {
  apps: [
    {
      name: 'budget-splitter-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'development',
        MODE: 'local',
        PORT: 3012
      },
      env_local: {
        NODE_ENV: 'production',
        MODE: 'local',
        PORT: 3012
      },
      env_vps: {
        NODE_ENV: 'production',
        MODE: 'vps',
        PORT: 3012
      }
    }
  ]
};
