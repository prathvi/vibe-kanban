module.exports = {
  apps: [
    {
      name: 'vibe-kanban-backend',
      cwd: '/home/ubuntu/vibe-kanban',
      script: 'cargo',
      args: 'run --bin server',
      interpreter: 'none',
      env: {
        RUST_LOG: 'info',
        PORT: '3001',
        HOST: '127.0.0.1',
        PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}`,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'vibe-kanban-frontend',
      cwd: '/home/ubuntu/vibe-kanban/frontend',
      script: 'npx',
      args: 'vite --port 3000 --host',
      interpreter: 'none',
      env: {
        VITE_OPEN: 'false',
        PATH: `${process.env.HOME}/.nvm/versions/node/v20.19.6/bin:${process.env.PATH}`,
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
