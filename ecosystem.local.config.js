module.exports = {
  apps: [
    {
      name: 'vibe-kanban-backend',
      cwd: '/Users/pratwirajpalekar/Apps/vibe-kanban',
      script: 'cargo',
      args: 'watch -w crates -x "run --bin server"',
      interpreter: 'none',
      env: {
        RUST_LOG: 'debug',
        PORT: '3001',
        HOST: '127.0.0.1',
        DISABLE_WORKTREE_ORPHAN_CLEANUP: '1',
        PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}`,
      },
      watch: false,
      autorestart: false,
      max_restarts: 3,
    },
    {
      name: 'vibe-kanban-frontend',
      cwd: '/Users/pratwirajpalekar/Apps/vibe-kanban/frontend',
      script: 'npx',
      args: 'vite --port 3000 --host',
      interpreter: 'none',
      env: {
        VITE_OPEN: 'false',
        BACKEND_PORT: '3001',
        PATH: `${process.env.PATH}`,
      },
      watch: false,
      autorestart: true,
      max_restarts: 5,
    },
  ],
};
