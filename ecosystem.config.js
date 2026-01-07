module.exports = {
  apps: [
    {
      name: 'vibe-kanban',
      cwd: '/Users/pratwirajpalekar/Apps/vibe-kanban',
      script: './target/release/server',
      interpreter: 'none',
      env: {
        RUST_LOG: 'info',
        PORT: '3001',
        HOST: '127.0.0.1',
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
